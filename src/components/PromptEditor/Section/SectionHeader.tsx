'use client';

/**
 * SectionHeader component
 * Header for an individual prompt section
 */

import React, { useState, useRef, useEffect } from 'react';
import { Section } from '@/types';
import { usePromptContext } from '@/contexts/PromptContext';
import { useTreeContext } from '@/contexts/TreeContext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import LibraryAddOutlinedIcon from '@mui/icons-material/LibraryAddOutlined';
import {
  FRAMEWORKS,
  getFramework,
  getFrameworkForType,
  getTypeLabel,
  SectionTypeValue,
} from '@/lib/frameworks';

interface SectionHeaderProps {
  section: Section;
  promptId: string;
  /**
   * The text the section is showing, which in 'using' mode is this use's
   * override rather than the stored content. What saving to the library acts
   * on, so the button follows what the user can see.
   */
  shownContent: string;
  onToggle: () => void;
  onDelete: () => void;
  nameInputRefCallback?: (el: HTMLInputElement | null) => void; // Added for focusing
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  section,
  promptId,
  shownContent,
  onToggle,
  onDelete,
  nameInputRefCallback, // Added for focusing
}) => {
  const { updateSection } = usePromptContext();
  const { setComponentBeingEdited, setComponentDraft, setComponentModalOpen } = useTreeContext();
  const [isEditing, setIsEditing] = useState(section.editingHeader || false); // Initialize with section.editingHeader
  const [editName, setEditName] = useState(section.name);
  const [editType, setEditType] = useState(section.type);
  const [editFrameworkId, setEditFrameworkId] = useState(getFrameworkForType(section.type).id);
  const nameInputRef = useRef<HTMLInputElement>(null); // Ref for the name input
  const editZoneRef = useRef<HTMLDivElement>(null); // Ref for the section-edit div
  const headerInfoRef = useRef<HTMLDivElement>(null); // Ref for the section-info div

  // Effect to manage the nameInputRef callback
  useEffect(() => {
    if (nameInputRefCallback) {
      nameInputRefCallback(nameInputRef.current);
    }
  }, [nameInputRefCallback, nameInputRef.current]);

  // Effect to handle initial editing state based on section.editingHeader
  useEffect(() => {
    if (section.editingHeader) {
      setIsEditing(true);
      setEditName(
        section.editingHeaderTempName !== undefined ? section.editingHeaderTempName : section.name
      );
      const initialType =
        section.editingHeaderTempType !== undefined ? section.editingHeaderTempType : section.type;
      setEditType(initialType);
      setEditFrameworkId(getFrameworkForType(initialType).id);
      // Reset the editingHeader flag in the context once editing is initiated
      // Also clear temp names/types
      updateSection(promptId, section.id, {
        editingHeader: false,
        editingHeaderTempName: undefined,
        editingHeaderTempType: undefined,
      });
    }
  }, [
    section.editingHeader,
    section.id,
    promptId,
    section.name,
    section.type,
    updateSection,
    section.editingHeaderTempName,
    section.editingHeaderTempType,
  ]);

  // Effect for dynamic input width adjustment
  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.style.minWidth = '100px'; // Or from SCSS
      nameInputRef.current.style.width = 'auto'; // Reset width to allow shrinkage

      // Ensure styles are applied and measurements can be taken
      requestAnimationFrame(() => {
        if (nameInputRef.current) {
          const scrollWidth = nameInputRef.current.scrollWidth;
          nameInputRef.current.style.width = `${scrollWidth}px`;

          if (headerInfoRef.current) {
            const containerWidth = headerInfoRef.current.offsetWidth;
            const maxWidth = containerWidth * 0.7;
            nameInputRef.current.style.maxWidth = `${maxWidth}px`;
          }
        }
      });
    }
  }, [isEditing, editName]);

  // Effect for click outside to save
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editZoneRef.current && !editZoneRef.current.contains(event.target as Node)) {
        saveEdit();
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, editName, editType]);

  // Start editing header
  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(section.name);
    setEditType(section.type);
    setEditFrameworkId(getFrameworkForType(section.type).id);
  };

  // Switch framework while editing; keep the type if the new framework shares it
  const handleFrameworkChange = (id: string) => {
    const framework = getFramework(id);
    setEditFrameworkId(framework.id);
    if (!framework.types.includes(editType)) {
      setEditType(framework.types[0]);
    }
  };

  // Save header edit
  const saveEdit = () => {
    // Only update if there are actual changes to name or type
    if (editName.trim() !== section.name || editType !== section.type) {
      if (editName.trim()) {
        // Ensure name is not just whitespace
        updateSection(promptId, section.id, {
          name: editName.trim(),
          type: editType,
        });
      } else if (section.name !== '') {
        // If original name was not empty, allow saving empty name
        updateSection(promptId, section.id, {
          name: '', // Save as empty
          type: editType,
        });
      }
    }
    setIsEditing(false);
  };

  /**
   * Opens the component editor on this section's text, so it can be saved into
   * the library and reused. The section is not linked to what comes out — the
   * modal records it as a copy origin, and linking stays an explicit choice.
   *
   * The text taken is what the section is showing. In 'using' mode — the
   * default — a section is typed into as an override, so reading the stored
   * content here would offer to save text the user cannot see, and would treat
   * a section they had just filled in as empty.
   */
  const saveAsComponent = (e: React.MouseEvent) => {
    e.stopPropagation();

    setComponentBeingEdited(null);
    setComponentDraft({
      name: section.name,
      content: shownContent,
      componentType: section.type,
      source: { promptId, sectionId: section.id },
    });
    setComponentModalOpen(true);
  };

  // Handle key press in edit mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="section-header" onClick={onToggle}>
      <div className="section-info" ref={headerInfoRef}>
        <div className="section-toggle">
          {section.open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </div>
        {isEditing ? (
          <div className="section-edit" ref={editZoneRef} onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              ref={nameInputRef}
            />
            <select
              value={editFrameworkId}
              onChange={e => handleFrameworkChange(e.target.value)}
              onClick={e => e.stopPropagation()}
              title="Framework"
            >
              {FRAMEWORKS.map(framework => (
                <option key={framework.id} value={framework.id}>
                  {framework.label}
                </option>
              ))}
            </select>
            •
            <select
              value={editType}
              onChange={e => {
                setEditType(e.target.value as SectionTypeValue);
              }}
              onClick={e => e.stopPropagation()}
              title="Type"
            >
              {getFramework(editFrameworkId).types.map(type => (
                <option key={type} value={type}>
                  {getTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            onClick={e => {
              if (section.open) {
                startEdit(e);
              }
            }}
            className="section-display"
          >
            {section.name} • {section.type ? getTypeLabel(section.type) : 'Section'}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="section-actions" onClick={e => e.stopPropagation()}>
          <button
            className="action-btn save-component-btn"
            onClick={saveAsComponent}
            title="Save as prompt component"
            aria-label={`Save ${section.name || 'section'} as a prompt component`}
            disabled={!shownContent.trim()}
          >
            <LibraryAddOutlinedIcon fontSize="small" />
          </button>
          <button className="action-btn delete-btn" onClick={onDelete} title="Delete Section">
            <CloseIcon fontSize="small" />
          </button>
        </div>
      )}
    </div>
  );
};

export default SectionHeader;
