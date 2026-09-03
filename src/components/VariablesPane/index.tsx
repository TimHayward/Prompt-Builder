'use client';

/**
 * VariablesPane component
 *
 * Edits the working values for the active prompt. The variable definitions —
 * names, labels and choice lists — come from the prompt's sections and are only
 * read here; nothing in this pane writes to the source prompt.
 */

import React, { useEffect, useState } from 'react';
import { usePromptContext } from '../../contexts/PromptContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { VariableSpec } from '../../utils/variableUtils';
import VariableField from './VariableField';
import './VariablesPane.scss';

const VariablesPane: React.FC = () => {
  const { activePromptId, prompts, getPromptVariableSpecs } = usePromptContext();
  const { getWorkingValues, setWorkingValues, clearWorkingValues, hasWorkingValues } =
    useWorkspaceContext();

  const [variableSpecs, setVariableSpecs] = useState<VariableSpec[]>([]);

  // Get the active prompt
  const activePrompt = prompts.find(p => p.id === activePromptId);

  // The definitions follow the prompt's sections, so they refresh as it is edited
  useEffect(() => {
    if (activePromptId && activePrompt) {
      setVariableSpecs(getPromptVariableSpecs(activePromptId));
    }
  }, [activePromptId, activePrompt?.sections, getPromptVariableSpecs]);

  const workingValues = activePromptId ? getWorkingValues(activePromptId) : {};

  const handleVariableChange = (variableKey: string, value: string) => {
    if (!activePromptId) return;
    setWorkingValues(activePromptId, { [variableKey]: value });
  };

  const handleClearValues = () => {
    if (activePromptId) {
      void clearWorkingValues(activePromptId);
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
                  value={workingValues[spec.key] || ''}
                  onChange={value => handleVariableChange(spec.key, value)}
                />
              </div>
            ))}
          </div>

          <div className="variables-actions">
            {hasWorkingValues(activePromptId) && (
              <button
                className="reset-btn"
                onClick={handleClearValues}
                title="Clear the values entered for this use; the prompt itself is unchanged"
              >
                Clear values
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VariablesPane;
