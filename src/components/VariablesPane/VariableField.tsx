'use client';

/**
 * VariableField component
 * One editor for one prompt variable: a plain textarea for free-text variables,
 * a dropdown for choice lists ({{mail/teams/calendar}}) with a "Custom…" entry
 * that falls back to the same textarea.
 */

import React, { useEffect, useState } from 'react';
import { VariableSpec } from '../../utils/variableUtils';

const CUSTOM_OPTION = '__custom__';
const PLACEHOLDER_OPTION = '__placeholder__';

type VariableFieldProps = {
  spec: VariableSpec;
  value: string;
  onChange: (value: string) => void;
};

const VariableField: React.FC<VariableFieldProps> = ({ spec, value, onChange }) => {
  // Only tracks the case where "Custom…" is picked but nothing typed yet — every
  // other mode is derived from the value, so a value saved before the token grew
  // a choice list (or one since removed from it) still opens in custom mode.
  const [forceCustom, setForceCustom] = useState(false);

  useEffect(() => {
    setForceCustom(false);
  }, [spec.key]);

  const hasOptions = spec.options.length > 0;
  const isCustom = forceCustom || (value !== '' && !spec.options.includes(value));

  const textarea = (
    <textarea
      id={`var-${spec.key}`}
      className="variable-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={`Enter value for ${spec.label}`}
      autoFocus={hasOptions}
    />
  );

  if (!hasOptions) {
    return textarea;
  }

  const handleSelect = (selected: string) => {
    if (selected === CUSTOM_OPTION) {
      setForceCustom(true);
      return;
    }
    setForceCustom(false);
    onChange(selected);
  };

  return (
    <>
      <select
        id={isCustom ? undefined : `var-${spec.key}`}
        className="variable-select"
        value={isCustom ? CUSTOM_OPTION : value || PLACEHOLDER_OPTION}
        onChange={e => handleSelect(e.target.value)}
      >
        <option value={PLACEHOLDER_OPTION} disabled>
          Select an option…
        </option>
        {spec.options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CUSTOM_OPTION}>Custom…</option>
      </select>
      {isCustom && textarea}
    </>
  );
};

export default VariableField;
