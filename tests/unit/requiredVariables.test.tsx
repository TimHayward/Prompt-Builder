/**
 * J2's acceptance: a required variable left empty is reported, and the copy
 * still goes through.
 *
 * The grammar itself is covered in variableUtils.test.ts; these check the two
 * places a user meets it — the preview and the toast after copying — and that
 * nothing blocks.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionBar from '@/components/PromptEditor/ActionBar';
import ResolvedPreview from '@/components/PromptEditor/ResolvedPreview';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import type { Prompt, Section } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const SOURCE_TEXT = 'Assess {{!customer}} using a {{tone: formal/technical=formal}} voice.';

const section = (content: string): Section => ({
  id: 's1',
  name: 'Instruction',
  content,
  type: 'instruction',
  open: true,
  dirty: false,
});

const promptFixture = (): Prompt => buildPrompt({ sections: [section(SOURCE_TEXT)] });

/** The working values the fake server reports for this prompt. */
let workingValues: Record<string, string>;
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
    return jsonResponse([{ promptId: 'prompt-1', values: workingValues, sectionOverrides: {} }]);
  }
  return jsonResponse({});
};

/** Reports the load, so a test can wait for it. */
const LoadProbe = () => {
  const { prompts } = usePromptContext();
  return <span data-testid="prompt-count">{prompts.length}</span>;
};

const renderEditorParts = async () => {
  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <WorkspaceProvider>
              <LoadProbe />
              <ResolvedPreview
                sections={[section(SOURCE_TEXT)]}
                values={workingValues}
                systemPrompt=""
                markdownEnabled={false}
              />
              <ActionBar activePromptId="prompt-1" systemPrompt="" markdownEnabled={false} />
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

const clickCopy = async () => {
  await act(async () => {
    screen.getByTitle('Copy Prompt').click();
  });
};

const previewText = () => document.querySelector('.resolved-preview-text')?.textContent ?? '';

beforeEach(() => {
  workingValues = {};
  clipboardText = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => mockFetch(String(input), init))
  );
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

describe('a required variable left empty', () => {
  it('is named in the preview', async () => {
    await renderEditorParts();

    expect(screen.getByText('customer has not been populated.')).toBeTruthy();
  });

  it('is named after copying', async () => {
    await renderEditorParts();

    await clickCopy();

    expect(screen.getByText('Copied. customer has not been populated.')).toBeTruthy();
  });

  it('does not stop the copy', async () => {
    await renderEditorParts();

    await clickCopy();

    // The acceptance allows a warning, not a barrier.
    expect(clipboardText).toBe(previewText());
    expect(clipboardText).toContain('Assess  using a formal voice.');
  });
});

describe('once it is filled in', () => {
  it('says nothing in the preview', async () => {
    workingValues = { customer: 'Contoso' };

    await renderEditorParts();

    expect(screen.queryByText(/has not been populated/)).toBeNull();
  });

  it('says nothing after copying', async () => {
    workingValues = { customer: 'Contoso' };

    await renderEditorParts();
    await clickCopy();

    expect(screen.queryByText(/has not been populated/)).toBeNull();
    expect(clipboardText).toBe('Assess Contoso using a formal voice.');
  });
});

describe('a default from the source', () => {
  it('resolves without being entered', async () => {
    await renderEditorParts();

    // tone was never given a working value, so its default stands in.
    expect(previewText()).toContain('a formal voice');
  });

  it('is not reported as an empty variable', async () => {
    await renderEditorParts();

    expect(screen.queryByText(/variables are empty/)).toBeNull();
    expect(screen.getByText(/One variable is empty: customer/)).toBeTruthy();
  });

  it('gives way to a value that was entered', async () => {
    workingValues = { customer: 'Contoso', tone: 'technical' };

    await renderEditorParts();

    expect(previewText()).toBe('Assess Contoso using a technical voice.');
  });
});
