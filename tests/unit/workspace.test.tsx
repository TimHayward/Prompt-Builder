/**
 * C1 and C2: working values are separate from the source prompt.
 *
 * The acceptance for both is behavioural — entering values must not touch the
 * prompt, and clearing them must leave the variable definitions and their
 * choices intact — so these drive the real contexts and watch what is sent.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { WorkspaceProvider, useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { extractVariableSpecsFromSections } from '@/utils/variableUtils';
import type { Prompt } from '@/types';

const DEBOUNCE_MS = 1000;
const SOURCE_TEXT = 'Send the update via {{channel: email/Teams/WhatsApp}}.';

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Announcement',
  description: '',
  isFavourite: false,
  sections: [
    {
      id: 's1',
      name: 'Instruction',
      content: SOURCE_TEXT,
      type: 'instruction',
      open: true,
      dirty: false,
    },
  ],
  variables: {},
});

/** Everything the fake server was asked to change. */
let promptWrites: { url: string; method: string; body: unknown }[];
let workspaceWrites: { url: string; method: string; body: unknown }[];
let workspacesOnServer: {
  promptId: string;
  values: Record<string, string>;
  sectionOverrides: Record<string, string>;
}[];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') {
    return jsonResponse([promptFixture()]);
  }
  if (url === '/api/workspaces' && method === 'GET') {
    return jsonResponse(workspacesOnServer);
  }
  if (url.startsWith('/api/workspaces/')) {
    workspaceWrites.push({ url, method, body });
    return jsonResponse({ promptId: 'prompt-1', values: {}, sectionOverrides: {} });
  }
  if (url === '/api/prompts' && method === 'POST') {
    promptWrites.push({ url, method, body });
    return jsonResponse({ ...(body as object), id: 'prompt-2', num: 2 }, 201);
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

const renderApp = async () => {
  const ref: { current: Contexts | null } = { current: null };

  const Probe = () => {
    ref.current = { prompts: usePromptContext(), workspace: useWorkspaceContext() };
    return null;
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <WorkspaceProvider>
              <Probe />
            </WorkspaceProvider>
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => {
    expect(ref.current?.prompts.isPromptsLoading).toBe(false);
    expect(ref.current?.workspace.isWorkspacesLoading).toBe(false);
  });

  return ref as { current: Contexts };
};

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

beforeEach(() => {
  promptWrites = [];
  workspaceWrites = [];
  workspacesOnServer = [];
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

describe('entering working values', () => {
  it('does not write to the source prompt', async () => {
    const app = await renderApp();

    act(() => app.current.workspace.setWorkingValues('prompt-1', { channel: 'Teams' }));
    await flush();

    expect(workspaceWrites).toHaveLength(1);
    expect(workspaceWrites[0].method).toBe('PUT');
    expect(workspaceWrites[0].body).toEqual({ values: { channel: 'Teams' }, sectionOverrides: {} });
    // The prompt itself was never touched.
    expect(promptWrites).toEqual([]);
  });

  it('leaves the variable definition in the section text alone', async () => {
    const app = await renderApp();

    act(() => app.current.workspace.setWorkingValues('prompt-1', { channel: 'Teams' }));
    await flush();

    const [section] = app.current.prompts.prompts[0].sections;
    expect(section.content).toBe(SOURCE_TEXT);
  });

  it('is readable back for the resolved prompt', async () => {
    const app = await renderApp();

    act(() => app.current.workspace.setWorkingValues('prompt-1', { channel: 'Teams' }));

    expect(app.current.workspace.getWorkingValues('prompt-1')).toEqual({ channel: 'Teams' });
    expect(app.current.workspace.hasWorkingValues('prompt-1')).toBe(true);
  });

  it('restores values saved in an earlier session', async () => {
    workspacesOnServer = [
      { promptId: 'prompt-1', values: { channel: 'WhatsApp' }, sectionOverrides: {} },
    ];
    const app = await renderApp();

    expect(app.current.workspace.getWorkingValues('prompt-1')).toEqual({ channel: 'WhatsApp' });
  });
});

describe('clearing working values', () => {
  it('empties the values and keeps every choice the source declares', async () => {
    const app = await renderApp();
    act(() => app.current.workspace.setWorkingValues('prompt-1', { channel: 'Teams' }));

    await act(async () => {
      await app.current.workspace.clearWorkingValues('prompt-1');
    });

    expect(app.current.workspace.getWorkingValues('prompt-1')).toEqual({});
    expect(app.current.workspace.hasWorkingValues('prompt-1')).toBe(false);

    // C2: the definition, and so the choice list, is untouched by any of this.
    const [section] = app.current.prompts.prompts[0].sections;
    expect(section.content).toBe(SOURCE_TEXT);
    const [spec] = extractVariableSpecsFromSections([section]);
    expect(spec.key).toBe('channel');
    expect(spec.options).toEqual(['email', 'Teams', 'WhatsApp']);
    expect(promptWrites).toEqual([]);
  });

  it('drops a queued save so it cannot write the values back', async () => {
    const app = await renderApp();

    act(() => app.current.workspace.setWorkingValues('prompt-1', { channel: 'Teams' }));
    await act(async () => {
      await app.current.workspace.clearWorkingValues('prompt-1');
    });
    await flush();

    expect(workspaceWrites.map(write => write.method)).toEqual(['DELETE']);
  });
});

describe('duplicating a prompt', () => {
  it('creates an independent prompt, with its own section ids', async () => {
    const app = await renderApp();
    const original = app.current.prompts.prompts[0];

    await act(async () => {
      await app.current.prompts.duplicatePrompt(original.id);
    });

    const created = promptWrites.find(write => write.method === 'POST');
    expect(created).toBeDefined();

    const body = created!.body as { name: string; sections: { id: string; content: string }[] };
    expect(body.name).toBe('Announcement (Copy)');

    // New ids, so editing the copy cannot reach into the original...
    expect(body.sections[0].id).not.toBe(original.sections[0].id);
    // ...and the text, with its variable definitions, comes across intact.
    expect(body.sections[0].content).toBe(SOURCE_TEXT);
  });
});
