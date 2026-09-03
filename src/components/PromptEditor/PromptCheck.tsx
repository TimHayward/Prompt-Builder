'use client';

/**
 * PromptCheck component
 *
 * What the prompt amounts to, and what looks wrong with it. Every finding comes
 * from a rule in `promptAnalysis`, so it can be read and argued with; nothing
 * here asks a model anything.
 */

import React, { useMemo } from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { useTreeContext } from '@/contexts/TreeContext';
import { compilePrompt } from '@/utils/compilePrompt';
import { lintPrompt, promptStatistics } from '@/domain/promptAnalysis';
import type { ComponentType, FolderType, Section, TreeNode } from '@/types';

interface PromptCheckProps {
  sections: Section[];
  values: Record<string, string>;
  systemPrompt?: string;
  markdownEnabled?: boolean;
}

/** Every component id in the library, however deeply nested. */
const collectComponentIds = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(node =>
    node.type === 'folder'
      ? collectComponentIds((node as FolderType).children)
      : [(node as ComponentType).id]
  );

const PromptCheck: React.FC<PromptCheckProps> = ({
  sections,
  values,
  systemPrompt,
  markdownEnabled,
}) => {
  const { treeData } = useTreeContext();

  // The same compilation the preview and the clipboard use, so the numbers
  // describe the text that would actually be sent.
  const { text } = useMemo(
    () => compilePrompt({ sections, values, systemPrompt, markdownEnabled }),
    [sections, values, systemPrompt, markdownEnabled]
  );

  const stats = useMemo(() => promptStatistics(text, sections), [text, sections]);

  const findings = useMemo(
    () =>
      lintPrompt({
        prompt: { sections },
        values,
        componentIds: new Set(collectComponentIds(treeData)),
      }),
    [sections, values, treeData]
  );

  const counts: [string, number][] = [
    ['Sections', stats.sections],
    ['Variables', stats.variables],
    ['Words', stats.words],
    ['Characters', stats.characters],
    ['Estimated tokens', stats.estimatedTokens],
  ];

  return (
    <div className="prompt-check">
      <ul className="check-statistics">
        {counts.map(([label, value]) => (
          <li key={label}>
            <span className="statistic-value">{value.toLocaleString()}</span>
            <span className="statistic-label">{label}</span>
          </li>
        ))}
      </ul>

      <p className="check-note">
        Tokens are an estimate, not a count: every provider splits text differently.
      </p>

      {findings.length === 0 ? (
        <p className="check-clear">
          <TaskAltIcon fontSize="small" />
          Nothing to report.
        </p>
      ) : (
        <ul className="check-findings">
          {findings.map((finding, index) => (
            <li key={`${finding.rule}-${finding.sectionId ?? index}`} className={finding.severity}>
              {finding.severity === 'warning' ? (
                <ErrorOutlineIcon fontSize="small" />
              ) : (
                <LightbulbOutlinedIcon fontSize="small" />
              )}
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PromptCheck;
