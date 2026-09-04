'use client';

/**
 * ImportPromptModal
 * Validate/refine step for importing a Markdown prompt. Splits the file into
 * components by top-level `#` headers, maps them to a framework's types, and on
 * confirm creates a library folder of components plus a linked prompt.
 */

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ModalBase from './ModalBase';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAppContext } from '../../contexts/AppContext';
import { useTreeContext } from '../../contexts/TreeContext';
import { usePromptContext } from '../../contexts/PromptContext';
import { ComponentType, Section } from '../../types';
import { insertNode } from '../../utils/treeUtils';
import { derivePromptName } from '../../utils/markdownParser';
import {
  parseMarkdownByHeaders,
  detectFramework,
  resolveTypeForFramework,
} from '../../utils/markdownImport';
import { FRAMEWORKS, getFramework, getTypeLabel, SectionTypeValue } from '../../lib/frameworks';

interface ImportRow {
  key: string;
  name: string;
  content: string;
  suggestedType: SectionTypeValue | null;
  type: SectionTypeValue;
  matched: boolean;
  typeTouched: boolean;
  expanded: boolean;
}

const ImportPromptModal: React.FC = () => {
  const { importPromptPayload, setImportPromptPayload } = useAppContext();
  const { treeData, setTreeData, isTreeLoading } = useTreeContext();
  const { addPrompt } = usePromptContext();

  const [title, setTitle] = useState('');
  const [frameworkId, setFrameworkId] = useState<string>('standard');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [noHeaders, setNoHeaders] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const isOpen = importPromptPayload !== null;

  // Parse the file whenever a new payload arrives
  useEffect(() => {
    if (!importPromptPayload) return;

    const { filename, content } = importPromptPayload;
    setError('');
    setImporting(false);
    setTitle(derivePromptName(filename));

    const parsed = parseMarkdownByHeaders(content);

    if (parsed.length === 0) {
      setNoHeaders(true);
      const trimmed = content.trim();
      if (!trimmed) {
        setRows([]);
        setFrameworkId('standard');
        return;
      }
      const fw = getFramework('standard');
      setFrameworkId(fw.id);
      const resolved = resolveTypeForFramework(null, fw);
      setRows([
        {
          key: uuidv4(),
          name: derivePromptName(filename),
          content: trimmed,
          suggestedType: null,
          type: resolved.type,
          matched: resolved.matched,
          typeTouched: false,
          expanded: false,
        },
      ]);
      return;
    }

    setNoHeaders(false);
    const detectedId = detectFramework(parsed);
    const framework = getFramework(detectedId);
    setFrameworkId(framework.id);
    setRows(
      parsed.map(section => {
        const resolved = resolveTypeForFramework(section.suggestedType, framework);
        return {
          key: uuidv4(),
          name: section.name,
          content: section.content,
          suggestedType: section.suggestedType,
          type: resolved.type,
          matched: resolved.matched,
          typeTouched: false,
          expanded: false,
        };
      })
    );
  }, [importPromptPayload]);

  const handleClose = () => {
    setImportPromptPayload(null);
  };

  const handleFrameworkChange = (id: string) => {
    const framework = getFramework(id);
    setFrameworkId(framework.id);
    setRows(prev =>
      prev.map(row => {
        // Keep a manually-set type if it's valid in the new framework
        if (
          row.typeTouched &&
          (framework.types as readonly SectionTypeValue[]).includes(row.type)
        ) {
          return { ...row, matched: true };
        }
        const resolved = resolveTypeForFramework(row.suggestedType, framework);
        return { ...row, type: resolved.type, matched: resolved.matched, typeTouched: false };
      })
    );
  };

  const updateRow = (key: string, updates: Partial<ImportRow>) => {
    setRows(prev => prev.map(row => (row.key === key ? { ...row, ...updates } : row)));
  };

  const handleImport = async () => {
    if (!title.trim() || rows.length === 0 || importing) return;
    setImporting(true);
    setError('');

    try {
      const components: ComponentType[] = rows.map(row => ({
        id: uuidv4(),
        name: row.name.trim() || 'Untitled',
        type: 'component',
        content: row.content,
        componentType: row.type,
      }));

      // Unique folder name under the root Components folder
      const root = treeData[0];
      const existingNames = new Set(
        (root?.children ?? []).filter(child => child.type === 'folder').map(child => child.name)
      );
      let folderName = title.trim();
      if (existingNames.has(folderName)) {
        let suffix = 2;
        while (existingNames.has(`${folderName} (${suffix})`)) suffix++;
        folderName = `${folderName} (${suffix})`;
      }

      if (root) {
        setTreeData(prev =>
          insertNode(prev, prev[0].id, {
            id: uuidv4(),
            name: folderName,
            type: 'folder',
            children: components,
            expanded: true,
          })
        );
      }

      // Prompt sections linked to the new components
      const sections: Section[] = components.map(component => ({
        id: uuidv4(),
        name: component.name,
        content: component.content,
        type: component.componentType,
        linkedComponentId: component.id,
        originalContent: component.content,
        open: true,
        dirty: false,
      }));

      // No variables are seeded: a prompt declares them in its text, and the
      // values for a use live in its workspace.
      await addPrompt(title.trim(), { sections });

      setImportPromptPayload(null);
    } catch (err) {
      console.error('Failed to import prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to import prompt');
      setImporting(false);
    }
  };

  const framework = getFramework(frameworkId);
  const emptyFile = noHeaders && rows.length === 0;

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Prompt Component from Markdown"
      className="import-prompt-modal"
    >
      {error && <div className="error-message">{error}</div>}

      {emptyFile ? (
        <div className="import-empty">The selected file is empty — nothing to import.</div>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="importTitle">Prompt title:</label>
            <input
              id="importTitle"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="importFramework">Framework:</label>
            <select
              id="importFramework"
              value={frameworkId}
              onChange={e => handleFrameworkChange(e.target.value)}
            >
              {FRAMEWORKS.map(fw => (
                <option key={fw.id} value={fw.id}>
                  {fw.label}
                </option>
              ))}
            </select>
          </div>

          {noHeaders && (
            <div className="import-note">
              No <code>#</code> headers found — importing the file as a single component.
            </div>
          )}

          <div className="import-rows">
            {rows.map(row => {
              const highlight = !row.matched && !row.typeTouched;
              return (
                <div key={row.key} className="import-row">
                  <div className="import-row-main">
                    <input
                      type="text"
                      className="import-row-name"
                      value={row.name}
                      onChange={e => updateRow(row.key, { name: e.target.value })}
                      placeholder="Component name"
                    />
                    <select
                      className={`import-row-type${highlight ? ' unmatched' : ''}`}
                      value={row.type}
                      onChange={e =>
                        updateRow(row.key, {
                          type: e.target.value as SectionTypeValue,
                          typeTouched: true,
                          matched: true,
                        })
                      }
                    >
                      {framework.types.map(type => (
                        <option key={type} value={type}>
                          {getTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="import-row-toggle"
                      onClick={() => updateRow(row.key, { expanded: !row.expanded })}
                      title={row.expanded ? 'Hide content' : 'Show content'}
                    >
                      {row.expanded ? (
                        <ExpandLessIcon fontSize="small" />
                      ) : (
                        <ExpandMoreIcon fontSize="small" />
                      )}
                    </button>
                  </div>
                  {row.expanded && (
                    <textarea
                      className="import-row-content"
                      value={row.content}
                      onChange={e => updateRow(row.key, { content: e.target.value })}
                      rows={6}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleImport}
          disabled={emptyFile || !title.trim() || rows.length === 0 || importing || isTreeLoading}
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>
    </ModalBase>
  );
};

export default ImportPromptModal;
