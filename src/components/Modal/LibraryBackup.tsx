'use client';

/**
 * LibraryBackup component
 *
 * Export writes the whole library to a file; import puts one back, replacing
 * what is there. The replace is why this asks first and says what the file
 * holds: a restore is not an addition, and the difference is not obvious from
 * the word "import".
 */

import React, { useRef, useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useToast } from '@/contexts/ToastContext';
import { apiSend, describeApiFailure } from '@/lib/apiClient';
import { backupSchema, describeBackup } from '@/domain/backup';

const LibraryBackup: React.FC = () => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isWorking, setWorking] = useState(false);

  const handleExport = async () => {
    setWorking(true);
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) throw new Error(`Export failed with ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `prompt-builder-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      showToast('Library exported.', 'success');
    } catch (error) {
      console.error('Failed to export the library:', error);
      showToast('Could not export the library.');
    } finally {
      setWorking(false);
    }
  };

  const handleFile = async (file: File) => {
    setWorking(true);
    try {
      const parsed = backupSchema.safeParse(JSON.parse(await file.text()));

      // Checked here as well as at the route, so a file picked by mistake is
      // refused before anything is asked or sent.
      if (!parsed.success) {
        showToast(`${file.name} is not a Prompt Builder backup.`);
        return;
      }

      const confirmed = window.confirm(
        `Restoring this backup replaces your library with ${describeBackup(parsed.data)}. ` +
          'Everything currently stored is removed. Export first if you want to keep it.'
      );
      if (!confirmed) return;

      await apiSend('/api/backup', 'POST', parsed.data);

      showToast('Library restored. Reloading…', 'success');
      // The whole application state came from the library that has just been
      // replaced, so it is reloaded rather than reconciled piece by piece.
      window.location.reload();
    } catch (error) {
      console.error('Failed to restore the library:', error);
      showToast(describeApiFailure(error, 'Could not restore the library.'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="form-group library-backup">
      <h4>Library backup</h4>
      <p>
        A backup holds your prompts, their sections and variable definitions, the component tree and
        these settings. Values entered while using a prompt are not included.
      </p>

      <div className="backup-actions">
        <button type="button" onClick={handleExport} disabled={isWorking}>
          <DownloadIcon fontSize="small" />
          Export library
        </button>

        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isWorking}>
          <UploadIcon fontSize="small" />
          Import library
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Choose a backup file"
          onChange={event => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file twice still counts as a change.
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </div>

      <p className="backup-note">
        Importing replaces the whole library. To back up the database file itself, see the
        documentation.
      </p>
    </div>
  );
};

export default LibraryBackup;
