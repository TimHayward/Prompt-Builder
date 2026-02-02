/**
 * useClipboard hook
 * Provides clipboard functionality with fallbacks for non-secure contexts
 */

import { useState, useCallback } from 'react';

type ClipboardStatus = 'idle' | 'success' | 'error';

interface UseClipboardReturn {
  copyToClipboard: (text: string) => Promise<boolean>;
  status: ClipboardStatus;
  isSupported: boolean;
}

export const useClipboard = (): UseClipboardReturn => {
  const [status, setStatus] = useState<ClipboardStatus>('idle');

  // Check if clipboard API is available
  const isSupported = typeof navigator !== 'undefined' &&
                     (!!navigator.clipboard || document.queryCommandSupported?.('copy'));

  /**
   * Fallback method: Use deprecated execCommand (works in HTTP)
   */
  const fallbackCopy = useCallback((text: string): boolean => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      document.body.removeChild(textArea);
      return false;
    }
  }, []);

  /**
   * Main copy function with fallback chain
   */
  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (!text) {
      setStatus('error');
      return false;
    }

    setStatus('idle');

    // Try modern clipboard API first (works on HTTPS/localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setStatus('success');
        setTimeout(() => setStatus('idle'), 2000);
        return true;
      } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);
      }
    }

    // Fallback to execCommand (works on HTTP)
    const success = fallbackCopy(text);
    setStatus(success ? 'success' : 'error');
    setTimeout(() => setStatus('idle'), 2000);
    return success;
  }, [fallbackCopy]);

  return {
    copyToClipboard,
    status,
    isSupported,
  };
};
