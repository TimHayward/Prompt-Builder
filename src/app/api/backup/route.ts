/**
 * API Route for library backups
 *
 * GET hands back the whole library as one JSON document; POST puts one back,
 * replacing what is there. Working values are in neither: they belong to a use
 * of a prompt rather than to the library.
 */
import { NextResponse } from 'next/server';
import { BackupFormatError, backupSchema, migrateBackup } from '@/domain/backup';
import { exportLibrary, importLibrary } from '@/lib/repositories/backupRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

/**
 * GET /api/backup
 * The whole library, as a file the browser will offer to save.
 */
export async function GET() {
  try {
    const backup = exportLibrary();
    const stamp = (backup.exportedAt ?? new Date().toISOString()).slice(0, 10);

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="prompt-builder-backup-${stamp}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting the library:', error);
    return errorResponse('Failed to export the library', 500);
  }
}

/**
 * POST /api/backup
 * Replaces the library with the contents of a backup.
 */
export async function POST(request: Request) {
  // Validated before anything is written: a file that is not a backup is
  // refused with an explanation, and nothing is deleted on the way to finding
  // that out.
  const parsed = await parseRequestBody(request, backupSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return NextResponse.json(importLibrary(migrateBackup(parsed.data)));
  } catch (error) {
    if (error instanceof BackupFormatError) {
      return errorResponse(error.message, 400);
    }

    console.error('Error restoring the library:', error);
    return errorResponse('Failed to restore the library', 500);
  }
}
