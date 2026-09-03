/**
 * K1, K2 and K3 through the real contexts.
 *
 * The point of the mode is a guarantee: while Using, nothing typed into a
 * section can reach the stored prompt. That cannot be shown by a pure function,
 * so these drive the editor's own components and watch what is sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { TreeProvider } from '@/contexts/TreeContext';
import { WorkspaceProvider, useWorkspaceContext } from '@/contexts/WorkspaceContext';
import Section from '@/components/PromptEditor/Section';
import type { Prompt } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const DEBOUNCE_MS = 1000;
const COMPREHENSIVE = 'Produce a comprehensive assessment.';
const CONCISE = 'Produce a concise assessment.';

const promptFixture = (): Prompt =>
  buildPrompt({
    name: 'Assessment',
    sections: [
      {
        id: 's1',
        name: 'Instruction',
        content: COMPREHENSIVE,
        type: 'instruction',
        open: true,
        dirty: false,
      },
    ],
  });

/** Everything the fake server was asked to change. */
let promptWrites: { url: string; method: string; body: unknown }[];
let workspaceWrites: { url: string; method: string; body: Record<string, unknown> }[];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') return jsonResponse([promptFixture()]);
  if (url === '/api/components' && method === 'GET') return jsonResponse([]);
  if (url === '/api/workspaces' && method === 'GET') return jsonResponse([]);
  if (url.startsWith('/api/workspaces/')) {
    workspaceWrites.push({ url, method, body: (body ?? {}) as Record<string, unknown> });
    return jsonResponse({ promptId: 'prompt-1', values: {}, sectionOverrides: {} });
  }
  if (url.startsWith('/api/prompts/')) {
    promptWrites.push({ url, method, body });
    return jsonResponse(promptFixture());
  }
  return jsonResponse({});
};

type Contexts = {
  prompts: ReturnType<typeof usePromptContext>;
  workspace: ReturnType<typeof useWorkspaceContext>;
};

/** Renders one section in the given mode, over the real providers. */
const renderSection = async (editMode: 'using' | 'source') => {
  const ref: { current: Contexts | null } = { current: null };

  const Host = () => {
    const prompts = usePromptContext();
    const workspace = useWorkspaceContext();
    ref.current = { prompts, workspace };

    const prompt = prompts.prompts.find(candidate => candidate.id === 'prompt-1');
    if (!prompt) return null;

    return (
      <Section section={prompt.sections[0]} promptId={prompt.id} editMode={editMode} index={0} />
    );
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <TreeProvider>
              <WorkspaceProvider>
                <Host />
              </WorkspaceProvider>
            </TreeProvider>
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => expect(sectionEditor().textContent).toBe(COMPREHENSIVE));

  return ref as { current: Contexts };
};

/** The contentEditable the section is written in. */
const sectionEditor = (): HTMLElement => {
  const editor = document.querySelector('.editable-content');
  if (!editor) throw new Error('the section editor is not rendered');
  return editor as HTMLElement;
};

const typeInSection = (text: string) => {
  const editor = sectionEditor();
  // What a browser does: the text is in the element, then it reports the input.
  editor.textContent = text;
  fireEvent.input(editor);
};

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

/** The last section text written to the stored prompt, if any. */
const lastSavedSections = () => {
  const write = [...promptWrites]
    .reverse()
    .find(candidate => (candidate.body as { sections?: unknown })?.sections);
  return (write?.body as { sections?: { content: string }[] } | undefined)?.sections;
};

/** The last override map sent to the workspace. */
const lastSavedOverrides = () => {
  const write = [...workspaceWrites]
    .reverse()
    .find(candidate => 'sectionOverrides' in candidate.body);
  return write?.body.sectionOverrides as Record<string, string> | undefined;
};

beforeEach(() => {
  promptWrites = [];
  workspaceWrites = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => mockFetch(String(input), init))
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('changing a section while using a prompt', () => {
  it('never writes to the stored prompt', async () => {
    const app = await renderSection('using');

    typeInSection(CONCISE);
    await flush();

    // The guarantee the mode exists for.
    expect(promptWrites).toEqual([]);
    expect(app.current.prompts.prompts[0].sections[0].content).toBe(COMPREHENSIVE);
  });

  it('keeps the change as an override', async () => {
    const app = await renderSection('using');

    typeInSection(CONCISE);
    await flush();

    expect(lastSavedOverrides()).toEqual({ s1: CONCISE });
    expect(app.current.workspace.getSectionOverrides('prompt-1')).toEqual({ s1: CONCISE });
  });

  it('says the section has changed, and offers the source', async () => {
    await renderSection('using');

    typeInSection(CONCISE);

    expect(screen.getByText('Changed for this use')).toBeTruthy();
    expect(screen.getByText(`Source says: ${COMPREHENSIVE}`)).toBeTruthy();
  });

  it('drops the override when the text matches the source again', async () => {
    const app = await renderSection('using');

    typeInSection(CONCISE);
    typeInSection(COMPREHENSIVE);
    await flush();

    expect(app.current.workspace.hasSectionOverrides('prompt-1')).toBe(false);
    expect(screen.queryByText('Changed for this use')).toBeNull();
  });

  it('reverts to what the prompt says', async () => {
    const app = await renderSection('using');

    typeInSection(CONCISE);
    fireEvent.click(screen.getByTitle('Return this section to what the prompt says'));
    await flush();

    expect(app.current.workspace.getSectionOverrides('prompt-1')).toEqual({});
    await waitFor(() => expect(sectionEditor().textContent).toBe(COMPREHENSIVE));
  });
});

describe('changing a section while editing the source', () => {
  it('writes to the stored prompt, as it always did', async () => {
    const app = await renderSection('source');

    typeInSection(CONCISE);
    await flush();

    expect(lastSavedSections()?.[0].content).toBe(CONCISE);
    expect(app.current.prompts.prompts[0].sections[0].content).toBe(CONCISE);
  });

  it('records nothing as a change for this use', async () => {
    const app = await renderSection('source');

    typeInSection(CONCISE);
    await flush();

    expect(app.current.workspace.hasSectionOverrides('prompt-1')).toBe(false);
  });
});

describe('resetting the working prompt', () => {
  it('clears the overrides and leaves the prompt as it was', async () => {
    const app = await renderSection('using');

    typeInSection(CONCISE);
    await flush();

    await act(async () => {
      await app.current.workspace.resetWorkingPrompt('prompt-1');
    });

    expect(app.current.workspace.getSectionOverrides('prompt-1')).toEqual({});
    expect(app.current.prompts.prompts[0].sections[0].content).toBe(COMPREHENSIVE);
    expect(promptWrites).toEqual([]);
  });
});
