'use client';

/**
 * Section component
 * Individual section within a prompt
 */

import React, { useState, useEffect, useRef } from 'react';
import { Section as SectionType, ComponentType } from '@/types';
import { usePromptContext } from '@/contexts/PromptContext';
import { useTreeContext } from '@/contexts/TreeContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import SectionHeader from './SectionHeader';
import HighlightedTextarea from '@/components/HighlightedTextarea';
import { usePrompts } from '@/hooks/usePrompts';
import { getTypeColor } from '@/lib/frameworks';
import { effectiveContent } from '@/domain/sectionOverrides';

interface SectionProps {
  section: SectionType;
  promptId: string;
  /**
   * Whether typing changes this use of the prompt or the prompt itself. In
   * 'using' the text is an override kept in the workspace; in 'source' it is
   * written to the stored section, as it always was.
   */
  editMode: 'using' | 'source';
  nameInputRefCallback?: (el: HTMLInputElement | null) => void; // Added for focusing
  index: number; // Added: index of the section
}

const findComponentById = (treeData: any[], id: string): ComponentType | null => {
  for (const node of treeData) {
    if (node.id === id && node.type === 'component') {
      return node as ComponentType;
    }

    if (node.type === 'folder' && node.children) {
      const found = findComponentById(node.children, id);
      if (found) return found;
    }
  }

  return null;
};

const Section: React.FC<SectionProps> = ({
  section,
  promptId,
  editMode,
  nameInputRefCallback,
  index,
}) => {
  const {
    updateSection,
    deleteSection,
    toggleSectionOpen,
    updateSectionFromLinkedComponent,
    addSectionFromComponent,
  } = usePromptContext();

  const { treeData } = useTreeContext();
  const { saveSectionToComponentLibrary } = usePrompts();
  const { getSectionOverrides, setSectionOverride, revertSectionOverride } = useWorkspaceContext();

  const overrides = getSectionOverrides(promptId);
  const isOverridden = section.id in overrides;

  // What the textarea is showing. In 'using' mode that is the text this use
  // asks for, which is not the stored section — so anything acting on "this
  // section's text", such as saving it to the library, has to read this rather
  // than section.content.
  const shownContent =
    editMode === 'using' ? effectiveContent(section, overrides) : section.content;

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Only a section the user linked follows the component. A copied section keeps
  // its origin for reference, but editing that component leaves it alone.
  useEffect(() => {
    if (section.linked && section.linkedComponentId) {
      const linkedComponent = findComponentById(treeData, section.linkedComponentId);

      if (
        linkedComponent &&
        (linkedComponent.content !== section.originalContent ||
          linkedComponent.componentType !== section.type ||
          linkedComponent.name !== section.name)
      ) {
        updateSectionFromLinkedComponent(promptId, section.id, linkedComponent);
      }
    }
  }, [
    treeData,
    section.linked,
    section.linkedComponentId,
    section.originalContent,
    section.type,
    section.name,
    promptId,
    updateSectionFromLinkedComponent,
  ]);

  /** The component this section came from, for the origin label. */
  const originComponent = section.linkedComponentId
    ? findComponentById(treeData, section.linkedComponentId)
    : null;
  const originComponentName = originComponent?.name ?? 'a deleted component';

  /**
   * Switches the section between following its component and standing alone.
   * Linking re-reads the component, so the section starts from its current text.
   */
  const handleToggleLinked = () => {
    if (section.linked) {
      updateSection(promptId, section.id, { linked: false, dirty: false });
      return;
    }

    if (originComponent) {
      updateSectionFromLinkedComponent(promptId, section.id, originComponent);
    }
    updateSection(promptId, section.id, { linked: true, dirty: false });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (editMode === 'using') {
      // The stored prompt is not touched: this is a change to the current use.
      setSectionOverride(promptId, section, e.target.value);
      return;
    }

    updateSection(promptId, section.id, {
      content: e.target.value,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      const dragData = JSON.parse(data);

      if (!dragData) return;

      // Handle folder drop with multiple components
      if (
        dragData.dragType === 'folder' &&
        dragData.components &&
        Array.isArray(dragData.components)
      ) {
        const components = dragData.components;

        if (components.length === 0) return;

        console.log('[Folder Drop] Components:', components);

        // Update current section with first component
        const firstComponent = components[0];
        console.log('[Folder Drop] First component:', firstComponent);

        updateSection(promptId, section.id, {
          content: firstComponent.content,
          type: firstComponent.componentType || 'instruction',
          name: firstComponent.name,
          linkedComponentId: firstComponent.id,
          linked: false,
          originalContent: firstComponent.content,
        });

        // Add remaining components as new sections after the current one
        components.slice(1).forEach((component: ComponentType, idx: number) => {
          console.log(`[Folder Drop] Adding component ${idx + 1}:`, component);
          // Add each component at index + 1 + idx to insert them sequentially after current section
          addSectionFromComponent(promptId, component, index + 1 + idx);
        });
      }
      // Handle standard component drop (original format)
      else if (dragData.type === 'component' && dragData.componentType) {
        updateSection(promptId, section.id, {
          content: dragData.content,
          type: dragData.componentType,
          name: dragData.name,
          linkedComponentId: dragData.id,
          linked: false,
          originalContent: dragData.content,
        });
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const handleSectionDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    const dragData = {
      dragType: 'existingSection',
      sectionId: section.id,
      promptId: promptId,
      sectionData: section,
      originalIndex: index, // Added: original index of the dragged section
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('is-dragging-something');
  };

  const handleSectionDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    document.body.classList.remove('is-dragging-something');
  };

  return (
    <div
      className={`section ${section.open ? 'open' : 'closed'} ${isDraggingOver ? 'drag-over' : ''} ${section.type}`}
      style={{ '--section-color': getTypeColor(section.type) } as React.CSSProperties}
    >
      <div
        className="section-drag-handle"
        draggable={true}
        onDragStart={handleSectionDragStart}
        onDragEnd={handleSectionDragEnd}
        title="Drag to reorder section"
      ></div>

      <SectionHeader
        section={section}
        promptId={promptId}
        shownContent={shownContent}
        onToggle={() => toggleSectionOpen(promptId, section.id)}
        onDelete={() => deleteSection(promptId, section.id)}
        nameInputRefCallback={nameInputRefCallback}
      />

      {section.open && (
        <div className="section-content" onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
          <HighlightedTextarea
            ref={textAreaRef}
            // Editing the source shows the source, even when this use has
            // changed the text: that is what is being edited.
            value={shownContent}
            onChange={value => {
              handleContentChange({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>);
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder="Section content..."
            className="section-input"
            autosize={true}
            isOpen={section.open}
          />

          {isOverridden && (
            <div className="section-override-indicator">
              <span className="override-mark" aria-hidden="true">
                ●
              </span>
              <span>Changed for this use</span>
              <button
                type="button"
                onClick={() => revertSectionOverride(promptId, section.id)}
                title="Return this section to what the prompt says"
              >
                Revert
              </button>
              <span className="override-source" title={section.content}>
                Source says: {section.content}
              </span>
            </div>
          )}

          {section.linkedComponentId && (
            <div
              className={`linked-component-indicator ${section.linked ? 'is-linked' : 'is-copy'}`}
            >
              <span>
                {section.linked
                  ? `Linked to ${originComponentName} — follows changes to it`
                  : `Copied from ${originComponentName}`}
              </span>
              <button
                className="link-toggle-btn"
                onClick={handleToggleLinked}
                title={
                  section.linked
                    ? 'Keep the text as it is now and stop following the component'
                    : 'Follow later changes to this component'
                }
              >
                {section.linked ? 'Make a copy' : 'Link to component'}
              </button>
              {section.linked && section.dirty && (
                <button
                  className="save-to-library-btn"
                  onClick={() => saveSectionToComponentLibrary(promptId, section.id)}
                >
                  Save to Library
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Section;
