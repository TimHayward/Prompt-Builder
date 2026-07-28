'use client';

/**
 * VariablesPane component
 * Displays and allows editing of prompt variables
 */

import React, { useState, useEffect } from 'react';
import { usePromptContext } from '../../contexts/PromptContext';
import { VariableSpec } from '../../utils/variableUtils';
import VariableField from './VariableField';
import './VariablesPane.scss';

const VariablesPane: React.FC = () => {
  const { activePromptId, prompts, getPromptVariableSpecs, getPromptVariables, updatePromptVariables } = usePromptContext();

  const [variableSpecs, setVariableSpecs] = useState<VariableSpec[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get the active prompt
  const activePrompt = prompts.find(p => p.id === activePromptId);

  // Update variables when active prompt or its sections change
  useEffect(() => {
    if (activePromptId && activePrompt) {
      const specs = getPromptVariableSpecs(activePromptId);
      setVariableSpecs(specs);

       // Only initialize variable values if they're not already set or if the variables changed
       setVariableValues(prevValues => {
         const currentValues = getPromptVariables(activePromptId);
         const updatedValues: Record<string, string> = { ...prevValues };
         const keys = specs.map(spec => spec.key);

         // Add any new variables that aren't in the current values
         keys.forEach(key => {
           if (!(key in updatedValues)) {
             updatedValues[key] = currentValues[key] || '';
           }
         });

         // Remove any variables that are no longer in the prompt
         Object.keys(updatedValues).forEach(key => {
           if (!keys.includes(key)) {
             delete updatedValues[key];
           }
         });

         return updatedValues;
       });
      setHasChanges(false);
    }
  }, [activePromptId, activePrompt?.sections]);

  const handleVariableChange = (variableKey: string, value: string) => {
    setVariableValues(prev => ({
      ...prev,
      [variableKey]: value
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
      variableSpecs.forEach(spec => {
        resetValues[spec.key] = currentValues[spec.key] || '';
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

      {variableSpecs.length === 0 ? (
        <div className="empty-state">
          <p>No variables found in this prompt</p>
          <span className="hint">Variables are formatted as {`{{variableName}}`}</span>
          <span className="hint">Use {`{{mail/teams/calendar}}`} for a list of options</span>
        </div>
      ) : (
        <>
          <div className="variables-list">
            {variableSpecs.map(spec => (
              <div key={spec.key} className="variable-item">
                <label htmlFor={`var-${spec.key}`} className="variable-label">
                  {spec.label}
                </label>
                <VariableField
                  spec={spec}
                  value={variableValues[spec.key] || ''}
                  onChange={(value) => handleVariableChange(spec.key, value)}
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
            {!hasChanges && variableSpecs.length > 0 && (
              <span className="saved-indicator">Saved</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VariablesPane;
