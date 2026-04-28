<#
.SYNOPSIS
    Watches a folder for new "Prompt - *.md" files and forwards them to an
    n8n webhook for ingestion into the Prompt Builder SQLite database.

.PARAMETER WatchPath
    Folder to monitor. Default: C:\Temp\Prompts

.PARAMETER WebhookUrl
    Full URL of the n8n webhook endpoint.

.EXAMPLE
    .\n8n-prompt-watcher.ps1 `
        -WatchPath  "C:\Temp\Prompts" `
        -WebhookUrl "http://your-n8n-server:5678/webhook/prompt-ingest"

.NOTES
    To register as a Windows Task Scheduler job that starts on login
    (run the following once in an elevated PowerShell session):

        $exe  = 'pwsh.exe'
        $args = '-NonInteractive -WindowStyle Hidden -File ' +
                '"C:\SupportLocal\GitHub\Prompt-Builder\scripts\n8n-prompt-watcher.ps1" ' +
                '-WatchPath "C:\Temp\Prompts" ' +
                '-WebhookUrl "http://your-n8n-server:5678/webhook/prompt-ingest"'
        $action  = New-ScheduledTaskAction -Execute $exe -Argument $args
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        Register-ScheduledTask -TaskName 'PromptBuilderWatcher' `
            -Action $action -Trigger $trigger -RunLevel Highest
#>
param(
    [string]$WatchPath  = 'C:\Temp\Prompts',
    [string]$WebhookUrl = 'http://your-n8n-server:5678/webhook/prompt-ingest'
)

# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
if ($WebhookUrl -like '*your-n8n-server*') {
    Write-Warning 'WebhookUrl has not been configured. Pass -WebhookUrl or edit the default at the top of this script.'
}

if (-not (Test-Path $WatchPath)) {
    New-Item -ItemType Directory -Path $WatchPath -Force | Out-Null
    Write-Host "Created watch folder: $WatchPath"
}

# ---------------------------------------------------------------------------
# HTTP sender — runs in the main loop, not in the event handler runspace
# ---------------------------------------------------------------------------
function Send-PromptToWebhook {
    param(
        [string]$FilePath,
        [string]$FileName,
        [string]$Url
    )

    # Retry up to 3 times; the creating process may still be writing the file
    $maxAttempts = 3
    $content     = $null

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            $content = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
            break
        }
        catch [System.IO.IOException] {
            if ($attempt -eq $maxAttempts) {
                Write-Warning "$(Get-Date -Format 's') [FAIL] Cannot read after $maxAttempts attempts: $FileName"
                return $false
            }
            Start-Sleep -Milliseconds (400 * $attempt)
        }
    }

    try {
        $body = [ordered]@{
            filename = $FileName
            content  = $content
        } | ConvertTo-Json -Depth 2 -Compress

        Invoke-RestMethod -Uri $Url -Method POST -Body $body `
            -ContentType 'application/json' -TimeoutSec 30 | Out-Null

        Write-Host "$(Get-Date -Format 's') [OK]    $FileName"
        return $true
    }
    catch {
        Write-Warning "$(Get-Date -Format 's') [ERROR] $FileName — $($_.Exception.Message)"
        return $false
    }
}

function Rename-ProcessedPromptFile {
    param(
        [string]$FilePath,
        [string]$FileName
    )

    if ($FileName -notmatch '^Prompt - (.+)$') {
        return
    }

    $baseName = $Matches[1]
    $targetName = "Uploaded - $baseName"
    $targetPath = Join-Path -Path (Split-Path -Parent $FilePath) -ChildPath $targetName

    # Avoid collisions if an uploaded file with the same name already exists.
    if (Test-Path $targetPath) {
        $stem = [System.IO.Path]::GetFileNameWithoutExtension($baseName)
        $ext = [System.IO.Path]::GetExtension($baseName)
        $suffix = Get-Date -Format 'yyyyMMdd-HHmmss'
        $targetName = "Uploaded - $stem-$suffix$ext"
        $targetPath = Join-Path -Path (Split-Path -Parent $FilePath) -ChildPath $targetName
    }

    try {
        Rename-Item -Path $FilePath -NewName $targetName -ErrorAction Stop
        Write-Host "$(Get-Date -Format 's') [RENAMED] $FileName -> $targetName"
    }
    catch {
        Write-Warning "$(Get-Date -Format 's') [WARN] Uploaded but failed to rename '$FileName' — $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------------------
# FileSystemWatcher — enqueues paths; the main loop dequeues and sends
# ---------------------------------------------------------------------------
$queue   = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$watcher = [System.IO.FileSystemWatcher]::new($WatchPath, '*.md')
$watcher.NotifyFilter          = [System.IO.NotifyFilters]::FileName
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents   = $true

# The action scriptblock runs in a separate runspace; use MessageData to pass
# the queue reference in (no $using: or closures needed).
$handler = {
    $name = $Event.SourceEventArgs.Name
    $path = $Event.SourceEventArgs.FullPath
    if ($name -match '^Prompt - .+\.md$') {
        $Event.MessageData.Enqueue($path)
    }
}

$subscription = Register-ObjectEvent `
    -InputObject $watcher `
    -EventName   Created  `
    -Action      $handler `
    -MessageData $queue

$subscriptionRenamed = Register-ObjectEvent `
    -InputObject $watcher `
    -EventName   Renamed  `
    -Action      $handler `
    -MessageData $queue

# Process any matching files that already exist when the watcher starts.
Get-ChildItem -Path $WatchPath -Filter 'Prompt - *.md' -File -ErrorAction SilentlyContinue |
    ForEach-Object { $queue.Enqueue($_.FullName) }

Write-Host "Watching : $WatchPath"
Write-Host "Webhook  : $WebhookUrl"
Write-Host "Filter   : Prompt - *.md"
Write-Host "Startup  : Existing matching files are queued once on launch"
Write-Host "Press Ctrl+C to stop.`n"

try {
    while ($true) {
        $filePath = $null
        while ($queue.TryDequeue([ref]$filePath)) {
            $fileName = [System.IO.Path]::GetFileName($filePath)
            # Brief pause to let the writing process finish flushing
            Start-Sleep -Milliseconds 500
            $uploaded = Send-PromptToWebhook -FilePath $filePath -FileName $fileName -Url $WebhookUrl
            if ($uploaded) {
                Rename-ProcessedPromptFile -FilePath $filePath -FileName $fileName
            }
        }
        Start-Sleep -Milliseconds 200
    }
}
finally {
    $subscription | Unregister-Event -ErrorAction SilentlyContinue
    $subscriptionRenamed | Unregister-Event -ErrorAction SilentlyContinue
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    Write-Host "`nWatcher stopped."
}
