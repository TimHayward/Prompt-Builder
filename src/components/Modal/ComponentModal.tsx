'use client';

/**
 * ComponentModal
 * Modal for adding and editing components
 */

import React, { useState, useEffect } from 'react';
import HistoryIcon from '@mui/icons-material/History';
import ModalBase from './ModalBase';
import RevisionHistoryModal from './RevisionHistoryModal';
import { useTreeContext } from '../../contexts/TreeContext';
import { usePromptContext } from '../../contexts/PromptContext';
import { describeComponentUsage, findComponentUsage } from '../../domain/componentLinks';
import { listFolders } from '../../utils/treeUtils';
import { DEFAULT_FRAMEWORK_ID, SectionTypeValue } from '../../lib/frameworks';
import { useFrameworkContext } from '../../contexts/FrameworkContext';

/**
 * One level of indentation in the folder picker, as two non-breaking spaces.
 *
 * A select collapses ordinary spaces, so the hierarchy would not read. Built
 * from the code point rather than typed, so an editor cannot quietly normalise
 * it back into something that does not indent.
 */
const FOLDER_INDENT = String.fromCharCode(160, 160);

const ComponentModal: React.FC = () => {
  const {
    isComponentModalOpen,
    setComponentModalOpen,
    componentBeingEdited,
    componentDraft,
    setComponentDraft,
    selectedNode,
    treeData,
    handleAddComponent,
    handleUpdateComponent,
  } = useTreeContext();

  const [componentName, setComponentName] = useState('');
  const [componentContent, setComponentContent] = useState('');
  // Set by the reset effect below when the modal opens: the default depends
  // on the loaded frameworks, and initial state cannot read a hook's value.
  const [componentType, setComponentType] = useState<SectionTypeValue>('');
  const [frameworkId, setFrameworkId] = useState<string>(DEFAULT_FRAMEWORK_ID);
  const [folderId, setFolderId] = useState<string>('');
  const [error, setError] = useState('');
  // Set when a save would change linked sections, so the user is told before it
  // reaches prompts they are not looking at.
  const [pendingWarning, setPendingWarning] = useState<string | null>(null);
  const [isHistoryOpen, setHistoryOpen] = useState(false);

  const { prompts, updateSection } = usePromptContext();
  // The frameworks as stored, so an edit in the sidebar is reflected here
  // rather than in a copy compiled into the bundle.
  const { frameworks, getFramework, getFrameworkForType, getComponent, typeLabel, defaultTypeFor } =
    useFrameworkContext();

  // Every folder the component could go in, parents before children.
  const folders = listFolders(treeData);

  // Reset form when modal opens/closes or editing component changes
  useEffect(() => {
    if (isComponentModalOpen) {
      if (componentBeingEdited) {
        // Editing an existing component
        setComponentName(componentBeingEdited.name);
        setComponentContent(componentBeingEdited.content);
        setComponentType(componentBeingEdited.componentType);
        setFrameworkId(getFrameworkForType(componentBeingEdited.componentType).id);
      } else if (componentDraft) {
        // Opened with text already in hand, e.g. a section being saved
        setComponentName(componentDraft.name);
        setComponentContent(componentDraft.content);
        setComponentType(componentDraft.componentType);
        setFrameworkId(getFrameworkForType(componentDraft.componentType).id);
      } else {
        // Adding a new component: the default framework, and the component at
        // the top of it.
        setComponentName('');
        setComponentContent('');
        setComponentType(defaultTypeFor(DEFAULT_FRAMEWORK_ID));
        setFrameworkId(DEFAULT_FRAMEWORK_ID);
      }

      // Where it lands: the selected folder when there is one, otherwise the
      // root — which is the only sensible default when the modal was opened
      // from the editor rather than from a folder in the tree.
      const selectedFolderId =
        selectedNode?.type === 'folder' ? selectedNode.id : (treeData[0]?.id ?? '');
      setFolderId(selectedFolderId);

      setError('');
      setPendingWarning(null);
    }
    // Keyed on what the editor is opened with, not on treeData or selectedNode:
    // those are read once as the form is seeded, and reseeding it because the
    // library saved in the background would discard what the user has typed.
  }, [isComponentModalOpen, componentBeingEdited, componentDraft]);

  /** Closes the editor and forgets any draft it was seeded with. */
  const closeModal = () => {
    setComponentModalOpen(false);
    setComponentDraft(null);
  };

  const handleFrameworkChange = (id: string) => {
    const framework = getFramework(id);
    setFrameworkId(framework.id);
    if (!framework.components.some(component => component.id === componentType)) {
      setComponentType(defaultTypeFor(framework.id));
    }
  };

  /** Writes the component away and closes. */
  const saveComponent = () => {
    if (componentBeingEdited) {
      // Update existing component
      handleUpdateComponent({
        ...componentBeingEdited,
        name: componentName.trim(),
        content: componentContent,
        componentType: componentType,
      });
    } else if (folderId) {
      // Add new component to the chosen folder
      const created = handleAddComponent(folderId, {
        name: componentName.trim(),
        content: componentContent,
        componentType: componentType,
      });

      // A section that produced this component records where it came from, but
      // is not linked to it: inserting a component copies by default, and
      // following one has to be asked for. The section keeps offering "Link to
      // component" from here.
      if (componentDraft?.source) {
        const { promptId, sectionId } = componentDraft.source;
        updateSection(promptId, sectionId, {
          linkedComponentId: created.id,
          originalContent: componentContent,
          linked: false,
          dirty: false,
        });
      }
    }

    closeModal();
  };

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!componentName.trim()) {
      setError('Component name is required');
      return;
    }

    if (!componentBeingEdited && !folderId) {
      setError('Choose a folder to save the component in');
      return;
    }

    // Editing a component that prompts follow changes those prompts too, which
    // is invisible from here — so say so once, and let the next submit through.
    if (componentBeingEdited && !pendingWarning) {
      const warning = describeComponentUsage(findComponentUsage(prompts, componentBeingEdited.id));
      if (warning) {
        setPendingWarning(warning);
        return;
      }
    }

    saveComponent();
  };

  return (
    <ModalBase
      isOpen={isComponentModalOpen}
      onClose={closeModal}
      title={componentBeingEdited ? 'Edit Component' : 'Add Component'}
      className="component-modal"
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}
        {pendingWarning && (
          <div className="warning-message" role="alert">
            {pendingWarning} Press Confirm again to go ahead.
          </div>
        )}

        <div className="form-group">
          <label htmlFor="componentName">Name:</label>
          <input
            id="componentName"
            type="text"
            value={componentName}
            onChange={e => setComponentName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Only when adding: an existing component is edited where it lives,
            and moving one is the tree's job. */}
        {!componentBeingEdited && (
          <div className="form-group">
            <label htmlFor="componentFolder">Folder:</label>
            <select
              id="componentFolder"
              value={folderId}
              onChange={e => setFolderId(e.target.value)}
            >
              {folders.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {`${FOLDER_INDENT.repeat(folder.depth)}${folder.name}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="componentFramework">Framework:</label>
          <select
            id="componentFramework"
            value={frameworkId}
            onChange={e => handleFrameworkChange(e.target.value)}
          >
            {frameworks.map(framework => (
              <option key={framework.id} value={framework.id}>
                {framework.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="componentType">Type:</label>
          <select
            id="componentType"
            value={componentType}
            onChange={e => setComponentType(e.target.value as SectionTypeValue)}
          >
            {getFramework(frameworkId).components.map(component => (
              <option key={component.id} value={component.id}>
                {component.label}
              </option>
            ))}
          </select>

          {/* What the chosen component is for, as the framework editor
              describes it. Shown where the choice is made rather than only in
              the editor, which is the point of describing it at all. */}
          {(getComponent(componentType)?.description || getComponent(componentType)?.example) && (
            <p className="component-type-guidance">
              {getComponent(componentType)?.description}
              {getComponent(componentType)?.example && (
                <span className="component-type-example">
                  e.g. {getComponent(componentType)?.example}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="componentContent">Content:</label>
          <textarea
            id="componentContent"
            value={componentContent}
            onChange={e => setComponentContent(e.target.value)}
            rows={10}
          />
        </div>

        <div className="form-actions">
          {componentBeingEdited && (
            <button
              type="button"
              className="history-link"
              onClick={() => setHistoryOpen(true)}
              title="What this component said before"
            >
              <HistoryIcon sx={{ fontSize: 16 }} />
              History
            </button>
          )}
          <button type="button" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {componentBeingEdited ? 'Confirm' : 'Create'}
          </button>
        </div>
      </form>

      {componentBeingEdited && (
        <RevisionHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setHistoryOpen(false)}
          kind="component"
          entityId={componentBeingEdited.id}
          current={{ name: componentName, content: componentContent }}
          onRestored={() => {
            // The library is reloaded on the next read; closing the editor
            // avoids leaving the old text sitting in a form over the new.
            setComponentModalOpen(false);
            window.location.reload();
          }}
        />
      )}
    </ModalBase>
  );
};

export default ComponentModal;
