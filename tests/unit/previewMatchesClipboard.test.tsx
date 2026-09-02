/**
 * D2's acceptance: preview and clipboard output are byte-for-byte identical.
 *
 * Rather than compare two strings built in the test, this renders the real
 * preview and clicks the real Copy button, then compares what the preview shows
 * with what reached the clipboard.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionBar from '@/components/PromptEditor/ActionBar';
import ResolvedPreview from '@/components/PromptEditor/ResolvedPreview';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider } from '@/contexts/PromptContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { usePromptContext } from '@/contexts/PromptContext';
import type { Prompt } from '@/types';

const SYSTEM_PROMPT = 'System guide line one.';

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Assessment',
  sections: [
    {
      id: 's1',
      name: 'Senior Reviewer',
      content: 'You are {{role}}.',
      type: 'role',
      open: true,
      dirty: false,
    },
    {
      id: 's2',
      name: 'Task',
      content: 'Review the {{technology}} estate for {{customer}}.',
      type: 'instruction',
      open: true,
      dirty: false,
    },
  ],
  variables: {},
});

const WORKING_VALUES = { role: 'a careful reviewer', technology: 'Intune' };

let clipboardText: string | null;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') return jsonResponse([promptFixture()]);
  if (url === '/api/workspaces' && method === 'GET') {
    return jsonResponse([{ promptId: 'prompt-1', values: WORKING_VALUES, sectionOverrides: {} }]);
  }
  return jsonResponse({});
};

/** Reports how many prompts the context has, so the test can wait for the load. */
const LoadProbe = () => {
  const { prompts } = usePromptContext();
  return <span data-testid="prompt-count">{prompts.length}</span>;
};

/** Renders the preview and the action bar over the same providers. */
const renderEditorParts = async (markdownEnabled: boolean) => {
  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
        <PromptProvider>
          <WorkspaceProvider>
            <LoadProbe />
            <ResolvedPreview
              sections={promptFixture().sections}
              values={WORKING_VALUES}
              systemPrompt={SYSTEM_PROMPT}
              markdownEnabled={markdownEnabled}
            />
            <ActionBar
              activePromptId="prompt-1"
              systemPrompt={SYSTEM_PROMPT}
              markdownEnabled={markdownEnabled}
            />
          </WorkspaceProvider>
        </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => {
    expect(screen.getByTestId('prompt-count').textContent).toBe('1');
    expect((screen.getByTitle('Copy Prompt') as HTMLButtonElement).disabled).toBe(false);
  });
};

const previewText = () => document.querySelector('.resolved-preview-text')?.textContent ?? '';

const clickCopy = async () => {
  await act(async () => {
    screen.getByTitle('Copy Prompt').click();
  });
};

beforeEach(() => {
  clipboardText = null;
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    mockFetch(String(input), init)
  ));
  // useClipboard takes the modern path only in a secure context; jsdom is not
  // one by default.
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        clipboardText = text;
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('preview and clipboard', () => {
  it('match with markdown prompting off', async () => {
    await renderEditorParts(false);
    const shown = previewText();

    await clickCopy();

    expect(clipboardText).toBe(shown);
    expect(shown).toContain('You are a careful reviewer.');
  });

  it('match with markdown prompting on, headings and all', async () => {
    await renderEditorParts(true);
    const shown = previewText();

    await clickCopy();

    expect(clipboardText).toBe(shown);
    expect(shown.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(shown).toContain('# Role: Senior Reviewer');
  });

  it('agree about a variable left blank', async () => {
    await renderEditorParts(false);
    const shown = previewText();

    await clickCopy();

    // {{customer}} has no value, so both drop it and the preview says so.
    expect(clipboardText).toBe(shown);
    expect(shown).toContain('Review the Intune estate for .');
    expect(screen.getByText(/One variable is empty: customer/)).toBeTruthy();
  });
});
