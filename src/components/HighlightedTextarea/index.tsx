'use client';

/**
 * HighlightedTextarea component
 * Editable div with syntax highlighting for {{variables}}
 * Uses contenteditable for direct text styling without overlay issues
 */

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
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
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  // Create a fake textarea ref for compatibility
  useImperativeHandle(ref, () => {
    // Return a partial HTMLTextAreaElement interface
    return {
      focus: () => editorRef.current?.focus(),
      blur: () => editorRef.current?.blur(),
      value: value,
      scrollHeight: editorRef.current?.scrollHeight || 0,
      style: editorRef.current?.style || {},
    } as HTMLTextAreaElement;
  });

  // Get plain text from the contenteditable
  const getPlainText = useCallback((element: HTMLElement): string => {
    let text = '';
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'BR') {
          text += '\n';
        } else if (el.tagName === 'DIV' || el.tagName === 'P') {
          if (text.length > 0 && !text.endsWith('\n')) {
            text += '\n';
          }
          text += getPlainText(el);
        } else {
          text += getPlainText(el);
        }
      }
    });
    return text;
  }, []);

  // Save and restore cursor position
  const saveCursorPosition = useCallback((): { start: number; end: number } | null => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const start = preCaretRange.toString().length;

    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const end = preCaretRange.toString().length;

    return { start, end };
  }, []);

  const restoreCursorPosition = useCallback((position: { start: number; end: number } | null) => {
    if (!position || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection) return;

    let charIndex = 0;
    const range = document.createRange();
    range.setStart(editorRef.current, 0);
    range.collapse(true);

    const nodeStack: Node[] = [editorRef.current];
    let node: Node | undefined;
    let foundStart = false;
    let foundEnd = false;

    while (!foundEnd && (node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textLength = node.textContent?.length || 0;
        const nextCharIndex = charIndex + textLength;

        if (!foundStart && position.start >= charIndex && position.start <= nextCharIndex) {
          range.setStart(node, position.start - charIndex);
          foundStart = true;
        }

        if (foundStart && position.end >= charIndex && position.end <= nextCharIndex) {
          range.setEnd(node, position.end - charIndex);
          foundEnd = true;
        }

        charIndex = nextCharIndex;
      } else {
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  // Create highlighted HTML from plain text
  const createHighlightedHTML = useCallback((text: string): string => {
    if (!text) return '';

    // Escape HTML entities
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Replace {{variables}} with highlighted spans
    const highlighted = escaped.replace(
      /(\{\{[^}]+\}\})/g,
      '<span class="highlighted-variable">$1</span>'
    );

    // Convert newlines to br tags
    return highlighted.replace(/\n/g, '<br>');
  }, []);

  // Handle input
  const handleInput = useCallback(() => {
    if (isComposing.current || !editorRef.current) return;

    const plainText = getPlainText(editorRef.current);
    onChange(plainText);
  }, [getPlainText, onChange]);

  // Handle paste - ensure plain text only
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Handle composition (for IME input)
  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false;
    handleInput();
  }, [handleInput]);

  // Handle drop events - adapt for div element
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (onDrop) {
      // Create a synthetic event that looks like a textarea event
      onDrop(e as unknown as React.DragEvent<HTMLTextAreaElement>);
    }
  }, [onDrop]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (onDragOver) {
      onDragOver(e as unknown as React.DragEvent<HTMLTextAreaElement>);
    }
  }, [onDragOver]);

  // Update the content when value changes from outside
  useEffect(() => {
    if (!editorRef.current) return;

    const currentText = getPlainText(editorRef.current);
    if (currentText !== value) {
      const cursorPos = saveCursorPosition();
      editorRef.current.innerHTML = createHighlightedHTML(value);
      if (document.activeElement === editorRef.current) {
        restoreCursorPosition(cursorPos);
      }
    }
  }, [value, getPlainText, createHighlightedHTML, saveCursorPosition, restoreCursorPosition]);

  // Initial render
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = createHighlightedHTML(value);
    }
  }, []);

  return (
    <div className={`highlighted-textarea-wrapper ${className}`}>
      <div
        ref={editorRef}
        className="editable-content"
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        data-placeholder={placeholder}
        spellCheck={false}
        suppressContentEditableWarning
      />
    </div>
  );
});

HighlightedTextarea.displayName = 'HighlightedTextarea';

export default HighlightedTextarea;
