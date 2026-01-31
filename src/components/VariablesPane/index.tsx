'use client';

/**
 * VariablesPane component
 * Displays and allows editing of prompt variables
 */

import React, { useState, useEffect } from 'react';
import { usePromptContext } from '../../contexts/PromptContext';
import './VariablesPane.scss';

const VariablesPane: React.FC = () => {
  const { activePromptId, prompts, getPromptVariableNames, getPromptVariables, updatePromptVariables } = usePromptContext();
  
  const [variableNames, setVariableNames] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get the active prompt
  const activePrompt = prompts.find(p => p.id === activePromptId);

  // Update variable names when active prompt or its sections change
  useEffect(() => {
    if (activePromptId && activePrompt) {
      const names = getPromptVariableNames(activePromptId);
      setVariableNames(names);
      
       // Only initialize variable values if they're not already set or if variable names changed
       setVariableValues(prevValues => {
         const currentValues = getPromptVariables(activePromptId);
         const updatedValues: Record<string, string> = { ...prevValues };
         
         // Add any new variables that aren't in the current values
         names.forEach(name => {
           if (!(name in updatedValues)) {
             updatedValues[name] = currentValues[name] || '';
           }
         });
         
         // Remove any variables that are no longer in the names list
         Object.keys(updatedValues).forEach(name => {
           if (!names.includes(name)) {
             delete updatedValues[name];
           }
         });
         
         return updatedValues;
       });
      setHasChanges(false);
    }
  }, [activePromptId, activePrompt?.sections]);

  const handleVariableChange = (variableName: string, value: string) => {
    setVariableValues(prev => ({
      ...prev,
      [variableName]: value
    }));
    setHasChanges(true);
  };

  const handleSaveVariables = () => {
    if (activePromptId && hasChanges) {
      updatePromptVariables(activePromptId, variableValues);
      setHasChanges(false);
    }
  };

  const handleResetVariables = () => {
    if (activePromptId) {
      const currentValues = getPromptVariables(activePromptId);
      const resetValues: Record<string, string> = {};
      variableNames.forEach(name => {
        resetValues[name] = currentValues[name] || '';
      });
      setVariableValues(resetValues);
      setHasChanges(false);
    }
  };

  if (!activePromptId) {
    return (
      <div id="variables-pane">
        <div className="empty-state">
          <p>No prompt selected</p>
        </div>
      </div>
    );
  }

  return (
    <div id="variables-pane">
      <header>
        <h2>Variables</h2>
      </header>

      {variableNames.length === 0 ? (
        <div className="empty-state">
          <p>No variables found in this prompt</p>
          <span className="hint">Variables are formatted as {`{{variableName}}`}</span>
        </div>
      ) : (
        <>
          <div className="variables-list">
            {variableNames.map(variableName => (
              <div key={variableName} className="variable-item">
                <label htmlFor={`var-${variableName}`} className="variable-label">
                  {variableName}
                </label>
                <textarea
                  id={`var-${variableName}`}
                  className="variable-input"
                  value={variableValues[variableName] || ''}
                  onChange={(e) => handleVariableChange(variableName, e.target.value)}
                  placeholder={`Enter value for {{${variableName}}}`}
                />
              </div>
            ))}
          </div>

          <div className="variables-actions">
            {hasChanges && (
              <>
                <button
                  className="save-btn"
                  onClick={handleSaveVariables}
                  title="Save variable changes"
                >
                  Save
                </button>
                <button
                  className="reset-btn"
                  onClick={handleResetVariables}
                  title="Reset to last saved values"
                >
                  Reset
                </button>
              </>
            )}
            {!hasChanges && variableNames.length > 0 && (
              <span className="saved-indicator">Saved</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VariablesPane;
