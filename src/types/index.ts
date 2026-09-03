/**
 * Type definitions for Prompt Builder
 */

import type { SectionTypeValue } from '../lib/frameworks';

export type { SectionTypeValue };

// Component types for the sidebar tree
export type ComponentType = {
  id: string;
  name: string;
  type: 'component';
  content: string;
  componentType: SectionTypeValue;
};

// Folder type for the sidebar tree
export type FolderType = {
  id: string;
  name: string;
  type: 'folder';
  children: (FolderType | ComponentType)[];
  expanded: boolean;
};

// Union type for items in the tree
export type TreeNode = FolderType | ComponentType;

/**
 * A section as stored on a prompt. This is the whole of what persistence sees —
 * nothing about how the editor is displaying it belongs here.
 */
export type StoredSection = {
  id: string;
  name: string;
  content: string;
  type: SectionTypeValue;
  /** The component this section came from, whether copied or linked. */
  linkedComponentId?: string; // Changed from number to string
  /**
   * Whether the section follows later edits to that component. Absent means a
   * copy: inserting a component takes its text, and changing the component
   * afterwards leaves prompts alone unless linking was asked for.
   */
  linked?: boolean;
  /** The component's content when it was inserted, to detect drift. */
  originalContent?: string;
};

/**
 * Editor state for a section. Lives only while the app is open: collapsing a
 * section or starting to rename it is not a change to the prompt.
 */
export type SectionUiState = {
  open: boolean;
  dirty: boolean;
  editingHeader?: boolean;
  editingHeaderTempName?: string;
  editingHeaderTempType?: SectionTypeValue;
};

/** What the editor works with: the stored section plus its editor state. */
export type Section = StoredSection & SectionUiState;

// Prompt type containing sections
export type Prompt = {
  id: string;
  /** Ordering position. Nullable in the database, so nullable here too. */
  num: number | null;
  name: string;
  sections: Section[];
  variables?: Record<string, string>; // Variables mapping: {variableName: value}
};

// Settings type for application configuration
export type Settings = {
  autoSave: boolean;
  defaultPromptName: string;
  defaultSectionType: SectionTypeValue;
  theme: 'dark' | 'light';
  markdownPromptingEnabled: boolean;
  systemPrompt: string;
};
