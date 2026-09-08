'use client';

/**
 * FrameworkEditor component
 *
 * Manages the frameworks available to the user: which one to edit, creating
 * another, and the name, description and components of the chosen one.
 *
 * Edits reach existing prompts without rewriting any of them, because a section
 * stores the id of a component and everything shown — the framework's name, the
 * component's name — is derived from that id. Removing a component is the one
 * operation that could orphan a section, so it is refused while anything uses
 * it and says what.
 */

import React, { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { v4 as uuidv4 } from 'uuid';
import CollapsibleSection from './CollapsibleSection';
import { useFrameworkContext } from '@/contexts/FrameworkContext';
import { usePromptContext } from '@/contexts/PromptContext';
import { useTreeContext } from '@/contexts/TreeContext';
import { describeTypeUsage, findTypeUsage } from '@/domain/frameworkUsage';
import type { FrameworkComponentPayload, FrameworkPayload } from '@/types/contracts';

/** A blank framework, ready to be named. */
const newFramework = (): FrameworkPayload => ({
  // A generated id, because the label is editable and the id is not: deriving
  // one from the name would break the moment the name changed.
  id: `framework-${uuidv4().slice(0, 8)}`,
  label: 'New framework',
  description: '',
  components: [],
});

const newComponent = (): FrameworkComponentPayload => ({
  id: `component-${uuidv4().slice(0, 8)}`,
  label: 'New component',
  description: '',
  example: '',
});

const FrameworkEditor: React.FC = () => {
  const { frameworks, saveFramework, deleteFramework } = useFrameworkContext();
  const { prompts } = usePromptContext();
  const { treeData } = useTreeContext();

  const [selectedId, setSelectedId] = useState<string>('');
  /** The framework being edited, held locally until saved. */
  const [draft, setDraft] = useState<FrameworkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Follow the loaded set: pick the first framework, and adopt an edit made
  // elsewhere unless there is an unsaved draft of the same one.
  useEffect(() => {
    if (frameworks.length === 0) return;
    setSelectedId(current =>
      current && frameworks.some(f => f.id === current) ? current : frameworks[0].id
    );
  }, [frameworks]);

  const selected = useMemo(
    () => frameworks.find(framework => framework.id === selectedId) ?? null,
    [frameworks, selectedId]
  );

  // Reset the draft whenever a different framework is chosen.
  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
    setError(null);
  }, [selected]);

  const editDraft = (changes: Partial<FrameworkPayload>) => {
    setDraft(current => (current ? { ...current, ...changes } : current));
    setError(null);
  };

  const editComponent = (id: string, changes: Partial<FrameworkComponentPayload>) => {
    setDraft(current =>
      current
        ? {
            ...current,
            components: current.components.map(component =>
              component.id === id ? { ...component, ...changes } : component
            ),
          }
        : current
    );
  };

  /** Moves a component one place, which is what reorders the Type dropdown. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setDraft(current => {
      if (!current || target < 0 || target >= current.components.length) return current;
      const components = [...current.components];
      [components[index], components[target]] = [components[target], components[index]];
      return { ...current, components };
    });
  };

  /**
   * Removes a component, unless a prompt or a library component still uses it.
   *
   * The check happens here rather than on the server because the prompts and
   * the library are already loaded in the browser; the server would have to
   * read both to reach the same answer.
   */
  const removeComponent = (component: FrameworkComponentPayload) => {
    const refusal = describeTypeUsage(
      findTypeUsage(prompts, treeData, component.id),
      component.label
    );

    if (refusal) {
      setError(refusal);
      return;
    }

    setDraft(current =>
      current
        ? { ...current, components: current.components.filter(c => c.id !== component.id) }
        : current
    );
  };

  const addComponent = () => {
    setDraft(current =>
      current ? { ...current, components: [...current.components, newComponent()] } : current
    );
  };

  const create = async () => {
    const framework = newFramework();
    if (await saveFramework(framework)) setSelectedId(framework.id);
  };

  const save = async () => {
    if (!draft) return;

    if (!draft.label.trim()) {
      setError('A framework needs a name.');
      return;
    }
    if (draft.components.some(component => !component.label.trim())) {
      setError('Every component needs a name.');
      return;
    }

    setSaving(true);
    await saveFramework({
      ...draft,
      label: draft.label.trim(),
      components: draft.components.map(component => ({
        ...component,
        label: component.label.trim(),
      })),
    });
    setSaving(false);
  };

  /** Refused while any of the framework's components are in use. */
  const remove = async () => {
    if (!draft) return;

    for (const component of draft.components) {
      const refusal = describeTypeUsage(
        findTypeUsage(prompts, treeData, component.id),
        component.label
      );
      if (refusal) {
        setError(refusal);
        return;
      }
    }

    const message =
      `Delete the "${draft.label}" framework and its ${draft.components.length} ` +
      'component definitions? This cannot be undone.';
    if (!window.confirm(message)) return;

    await deleteFramework(draft.id);
  };

  return (
    <CollapsibleSection title="Frameworks" className="framework-editor">
      <>
        <div className="framework-editor-pick">
          <label htmlFor="frameworkSelect">Framework:</label>
          <select
            id="frameworkSelect"
            value={selectedId}
            onChange={event => setSelectedId(event.target.value)}
          >
            {frameworks.map(framework => (
              <option key={framework.id} value={framework.id}>
                {framework.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="action-btn"
            onClick={create}
            title="Create a framework"
            aria-label="Create a framework"
          >
            <AddIcon fontSize="small" />
          </button>
        </div>

        {error && (
          <div className="framework-editor-error" role="alert">
            {error}
          </div>
        )}

        {draft && (
          <>
            <div className="framework-editor-field">
              <label htmlFor="frameworkName">Name:</label>
              <input
                id="frameworkName"
                type="text"
                value={draft.label}
                onChange={event => editDraft({ label: event.target.value })}
              />
            </div>

            <div className="framework-editor-field">
              <label htmlFor="frameworkDescription">Description:</label>
              <textarea
                id="frameworkDescription"
                value={draft.description}
                onChange={event => editDraft({ description: event.target.value })}
                rows={2}
              />
            </div>

            <h3>Components</h3>
            <p className="framework-editor-hint">
              The order is the order they are offered in, and the one at the top is what a new
              component starts as.
            </p>

            <ul className="framework-component-list">
              {draft.components.map((component, index) => (
                <li key={component.id} className="framework-component">
                  <div className="framework-component-head">
                    <input
                      type="text"
                      className="framework-component-name"
                      value={component.label}
                      onChange={event => editComponent(component.id, { label: event.target.value })}
                      aria-label={`Name of component ${index + 1}`}
                    />
                    <div className="framework-component-actions">
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                        aria-label={`Move ${component.label} up`}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => move(index, 1)}
                        disabled={index === draft.components.length - 1}
                        title="Move down"
                        aria-label={`Move ${component.label} down`}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </button>
                      <button
                        type="button"
                        className="action-btn delete-btn"
                        onClick={() => removeComponent(component)}
                        title="Remove"
                        aria-label={`Remove ${component.label}`}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    className="framework-component-description"
                    value={component.description}
                    onChange={event =>
                      editComponent(component.id, { description: event.target.value })
                    }
                    placeholder="What belongs in this component"
                    aria-label={`Description of ${component.label}`}
                    rows={2}
                  />
                  <input
                    type="text"
                    className="framework-component-example"
                    value={component.example}
                    onChange={event => editComponent(component.id, { example: event.target.value })}
                    placeholder="Example"
                    aria-label={`Example for ${component.label}`}
                  />
                </li>
              ))}
            </ul>

            <button type="button" className="framework-editor-add" onClick={addComponent}>
              <AddIcon fontSize="small" />
              Add component
            </button>

            <div className="framework-editor-actions">
              <button type="button" className="framework-editor-delete" onClick={remove}>
                Delete framework
              </button>
              <button
                type="button"
                className="framework-editor-save"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save framework'}
              </button>
            </div>
          </>
        )}
      </>
    </CollapsibleSection>
  );
};

export default FrameworkEditor;
