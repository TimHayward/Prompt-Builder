'use client';

/**
 * ComponentModal
 * Modal for adding and editing components
 */

import React, { useState, useEffect } from 'react';
import ModalBase from './ModalBase';
import { useTreeContext } from '../../contexts/TreeContext';
import { usePromptContext } from '../../contexts/PromptContext';
import { describeComponentUsage, findComponentUsage } from '../../domain/componentLinks';
import {
  FRAMEWORKS,
  DEFAULT_FRAMEWORK_ID,
  DEFAULT_TYPE,
  getFramework,
  getFrameworkForType,
  getTypeLabel,
  SectionTypeValue,
} from '../../lib/frameworks';

const ComponentModal: React.FC = () => {
  const {
    isComponentModalOpen,
    setComponentModalOpen,
    componentBeingEdited,
    selectedNode,
    handleAddComponent,
    handleUpdateComponent,
  } = useTreeContext();

  const [componentName, setComponentName] = useState('');
  const [componentContent, setComponentContent] = useState('');
  const [componentType, setComponentType] = useState<SectionTypeValue>(DEFAULT_TYPE);
  const [frameworkId, setFrameworkId] = useState<string>(DEFAULT_FRAMEWORK_ID);
  const [error, setError] = useState('');
  // Set when a save would change linked sections, so the user is told before it
  // reaches prompts they are not looking at.
  const [pendingWarning, setPendingWarning] = useState<string | null>(null);

  const { prompts } = usePromptContext();

  // Reset form when modal opens/closes or editing component changes
  useEffect(() => {
    if (isComponentModalOpen) {
      if (componentBeingEdited) {
        // Editing an existing component
        setComponentName(componentBeingEdited.name);
        setComponentContent(componentBeingEdited.content);
        setComponentType(componentBeingEdited.componentType);
        setFrameworkId(getFrameworkForType(componentBeingEdited.componentType).id);
      } else {
        // Adding a new component
        setComponentName('');
        setComponentContent('');
        setComponentType(DEFAULT_TYPE);
        setFrameworkId(DEFAULT_FRAMEWORK_ID);
      }
      setError('');
      setPendingWarning(null);
    }
  }, [isComponentModalOpen, componentBeingEdited]);

  const handleFrameworkChange = (id: string) => {
    const framework = getFramework(id);
    setFrameworkId(framework.id);
    if (!framework.types.includes(componentType)) {
      setComponentType(framework.types[0]);
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
    } else if (selectedNode && selectedNode.type === 'folder') {
      // Add new component
      handleAddComponent(selectedNode.id, {
        name: componentName.trim(),
        content: componentContent,
        componentType: componentType,
      });
    }

    setComponentModalOpen(false);
  };

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!componentName.trim()) {
      setError('Component name is required');
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
      onClose={() => setComponentModalOpen(false)}
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

        <div className="form-group">
          <label htmlFor="componentFramework">Framework:</label>
          <select
            id="componentFramework"
            value={frameworkId}
            onChange={e => handleFrameworkChange(e.target.value)}
          >
            {FRAMEWORKS.map(framework => (
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
            {getFramework(frameworkId).types.map(type => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </select>
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
          <button type="button" onClick={() => setComponentModalOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {componentBeingEdited ? 'Confirm' : 'Create'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
};

export default ComponentModal;
