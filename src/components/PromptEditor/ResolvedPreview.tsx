'use client';

/**
 * ResolvedPreview component
 *
 * Shows the resolved prompt: the source with this use's working values applied.
 * It calls the same compiler the Copy button does, with the same inputs, so
 * what is shown here is what lands on the clipboard.
 */

import React from 'react';
import { compilePrompt } from '@/utils/compilePrompt';
import type { Section } from '@/types';
import './ResolvedPreview.scss';

type ResolvedPreviewProps = {
  sections: Section[];
  values: Record<string, string>;
  systemPrompt: string;
  markdownEnabled: boolean;
};

const ResolvedPreview: React.FC<ResolvedPreviewProps> = ({
  sections,
  values,
  systemPrompt,
  markdownEnabled,
}) => {
  const { text, unresolved, missingRequired } = compilePrompt({
    sections,
    values,
    systemPrompt,
    markdownEnabled,
  });

  return (
    <div className="resolved-preview">
      {missingRequired.length > 0 && (
        <p className="resolved-preview-required">
          {missingRequired.length === 1
            ? `${missingRequired[0]} has not been populated.`
            : `${missingRequired.join(', ')} have not been populated.`}
        </p>
      )}

      {unresolved.length > 0 && (
        <p className="resolved-preview-note">
          {unresolved.length === 1
            ? 'One variable is empty: '
            : `${unresolved.length} variables are empty: `}
          {unresolved.join(', ')}
        </p>
      )}

      {text ? (
        // A <pre> so the text is shown exactly as it will be copied, including
        // the blank lines between sections.
        <pre className="resolved-preview-text">{text}</pre>
      ) : (
        <p className="resolved-preview-empty">This prompt has no content yet.</p>
      )}
    </div>
  );
};

export default ResolvedPreview;
