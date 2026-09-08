'use client';

/**
 * CollapsibleSection component
 *
 * One titled, collapsible band in the sidebar. The sidebar holds three of them
 * — Frameworks, Prompt Components and Saved Prompts — and the point of folding
 * one away is to give the other two the room, so the header stays put and only
 * the body goes.
 *
 * Open state is held here and not persisted, matching what the Frameworks
 * section did when it was the only one: a fold is a passing arrangement rather
 * than a preference. Pane widths are the thing worth remembering, and those
 * already are.
 */

import React, { useState, type ReactNode } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface CollapsibleSectionProps {
  title: string;
  /** Whether it starts open. Sections that hold the day-to-day work do. */
  defaultOpen?: boolean;
  /** Distinguishes the section for the stylesheet, which sizes each one. */
  className?: string;
  children: ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultOpen = false,
  className = '',
  children,
}) => {
  const [isOpen, setOpen] = useState(defaultOpen);

  return (
    <section className={`sidebar-section ${className}${isOpen ? ' is-open' : ' is-collapsed'}`}>
      <header>
        <h2>
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => setOpen(open => !open)}
            aria-expanded={isOpen}
          >
            {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            {title}
          </button>
        </h2>
      </header>

      {/* Unmounted rather than hidden: a collapsed section should cost no
          layout, and the tree and the prompt list are not cheap to keep. */}
      {isOpen && <div className="sidebar-section-body">{children}</div>}
    </section>
  );
};

export default CollapsibleSection;
