'use client';

/**
 * HighlightedTextarea component
 * Textarea with syntax highlighting for {{variables}}
 */

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import './HighlightedTextarea.scss';

interface HighlightedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onDrop?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  autosize?: boolean;
  isOpen?: boolean;
}

const HighlightedTextarea = forwardRef<HTMLTextAreaElement, HighlightedTextareaProps>(({
  value,
  onChange,
  placeholder = '',
  className = '',
  onDrop,
  onDragOver,
  autosize = false,
  isOpen = true,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Expose the textarea ref to parent components
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  // Auto-resize textarea to fit content if autosize is enabled
  useLayoutEffect(() => {
    if (autosize && textareaRef.current && isOpen) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value, autosize, isOpen]);

  // Sync scroll position between textarea and highlight layer
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Parse text and highlight {{variables}}
  const highlightVariables = (text: string): React.ReactNode[] => {
    if (!text) {
      return [];
    }

    const regex = /(\{\{[^}]+\}\})/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
        // This is a variable
        return (
          <span key={index} className="highlighted-variable">
            {part}
          </span>
        );
      }
      // Regular text
      return <span key={index}>{part}</span>;
    });
  };

  // Handle textarea changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Update highlight layer when value changes
  useEffect(() => {
    handleScroll();
  }, [value]);

  return (
    <div className={`highlighted-textarea-wrapper ${className}`}>
      {/* Syntax highlighted background */}
      <div
        ref={highlightRef}
        className="highlight-layer"
        aria-hidden="true"
      >
        <pre>
          {highlightVariables(value)}
          {/* Add newline at end to match textarea rendering */}
          {'\n'}
        </pre>
      </div>

      {/* Editable textarea overlay */}
      <textarea
        ref={textareaRef}
        className={`editable-layer ${isFocused ? 'focused' : ''}`}
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
});

HighlightedTextarea.displayName = 'HighlightedTextarea';

export default HighlightedTextarea;
