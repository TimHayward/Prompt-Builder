/**
 * Tabs as a working set over the saved library (Q1).
 *
 * The behaviour these lock down is the one the tab strip used to get wrong:
 * closing a tab is not a delete. A closed prompt is still on the server, still
 * reopenable, and still carries what it said; only an explicit delete removes
 * it. The open set is also what gets remembered, so the strip comes back rather
 * than every prompt that happens to exist.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import type { Prompt } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const DEBOUNCE_MS = 1000;

type ContextValue = ReturnType<typeof usePromptContext>;

let promptsOnServer: Prompt[];
let deletedIds: string[];
/** What was stored about the tab strip, newest last. */
let savedTabs: { activePromptId: string | null; openPromptIds?: string[] }[];
/** What GET /api/settings answers with. */
let storedTabs: { activePromptId: string | null; openPromptIds?: string[] };

const jsonResponse = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );

const mockFetch = (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, ...storedTabs });
  }

  if (url === '/api/settings' && method === 'POST') {
    savedTabs.push(JSON.parse(String(init?.body)));
    return jsonResponse({});
  }

  if (url === '/api/prompts' && method === 'GET') {
    return jsonResponse(promptsOnServer);
  }

  if (url.startsWith('/api/prompts/') && method === 'DELETE') {
    const id = url.slice('/api/prompts/'.length);
    deletedIds.push(id);
    promptsOnServer = promptsOnServer.filter(prompt => prompt.id !== id);
    return jsonResponse({});
  }

  return jsonResponse({});
};

const renderPromptContext = async () => {
  const contextRef: { current: ContextValue | null } = { current: null };

  const Probe = () => {
    contextRef.current = usePromptContext();
    return null;
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <Probe />
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => {
    expect(contextRef.current?.isPromptsLoading).toBe(false);
    expect(contextRef.current?.prompts).toHaveLength(promptsOnServer.length);
  });

  return contextRef as { current: ContextValue };
};

/** Runs the debounce window out so a queued tab write is sent. */
const flushSaves = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

describe('open tabs', () => {
  beforeEach(() => {
    promptsOnServer = [
      buildPrompt({ id: 'prompt-1', name: 'One' }),
      buildPrompt({ id: 'prompt-2', name: 'Two' }),
      buildPrompt({ id: 'prompt-3', name: 'Three' }),
    ];
    deletedIds = [];
    savedTabs = [];
    storedTabs = {
      activePromptId: 'prompt-1',
      openPromptIds: ['prompt-1', 'prompt-2', 'prompt-3'],
    };
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

  it('closing a tab keeps the prompt, and reopening restores what it said', async () => {
    promptsOnServer = [
      buildPrompt({
        id: 'prompt-1',
        name: 'One',
        sections: [
          {
            id: 's1',
            name: 'Task',
            content: 'Keep me',
            type: 'instruction',
            open: true,
            dirty: false,
          },
        ],
      }),
      buildPrompt({ id: 'prompt-2', name: 'Two' }),
    ];
    storedTabs = { activePromptId: 'prompt-1', openPromptIds: ['prompt-1', 'prompt-2'] };
    const context = await renderPromptContext();

    act(() => context.current.closePrompt('prompt-1'));

    expect(context.current.openPromptIds).toEqual(['prompt-2']);
    // The whole point: no DELETE went out, and the prompt is still loaded.
    expect(deletedIds).toEqual([]);
    expect(context.current.prompts.map(prompt => prompt.id)).toContain('prompt-1');

    act(() => context.current.openPrompt('prompt-1'));

    expect(context.current.openPromptIds).toEqual(['prompt-2', 'prompt-1']);
    expect(context.current.activePromptId).toBe('prompt-1');
    const reopened = context.current.prompts.find(prompt => prompt.id === 'prompt-1');
    expect(reopened?.sections[0].content).toBe('Keep me');
  });

  it('hands the active tab to its left-hand neighbour when it closes', async () => {
    const context = await renderPromptContext();

    act(() => context.current.openPrompt('prompt-2'));
    act(() => context.current.closePrompt('prompt-2'));

    expect(context.current.activePromptId).toBe('prompt-1');
    expect(context.current.openPromptIds).toEqual(['prompt-1', 'prompt-3']);
  });

  it('leaves nothing active when the last tab closes, with the library intact', async () => {
    const context = await renderPromptContext();

    act(() => {
      context.current.closePrompt('prompt-1');
      context.current.closePrompt('prompt-2');
      context.current.closePrompt('prompt-3');
    });

    expect(context.current.openPromptIds).toEqual([]);
    expect(context.current.activePromptId).toBeNull();
    // No tab open is a state now, not a reason to reopen something.
    expect(context.current.prompts).toHaveLength(3);
    expect(deletedIds).toEqual([]);
  });

  it('re-opening an already-open prompt activates it without a second tab', async () => {
    const context = await renderPromptContext();

    act(() => context.current.openPrompt('prompt-3'));

    expect(context.current.openPromptIds).toEqual(['prompt-1', 'prompt-2', 'prompt-3']);
    expect(context.current.activePromptId).toBe('prompt-3');
  });

  it('deleting removes the prompt and closes its tab', async () => {
    const context = await renderPromptContext();

    await act(async () => {
      await context.current.deletePrompt('prompt-2');
    });

    expect(deletedIds).toEqual(['prompt-2']);
    expect(context.current.prompts.map(prompt => prompt.id)).toEqual(['prompt-1', 'prompt-3']);
    expect(context.current.openPromptIds).toEqual(['prompt-1', 'prompt-3']);
  });

  it('records the open tabs and the active one together', async () => {
    const context = await renderPromptContext();

    act(() => context.current.closePrompt('prompt-1'));
    await flushSaves();

    expect(savedTabs.at(-1)).toEqual({
      activePromptId: 'prompt-2',
      openPromptIds: ['prompt-2', 'prompt-3'],
    });
  });

  it('restores the stored tabs, dropping ids whose prompt has gone', async () => {
    storedTabs = {
      activePromptId: 'prompt-3',
      openPromptIds: ['prompt-3', 'deleted-elsewhere', 'prompt-1'],
    };

    const context = await renderPromptContext();

    expect(context.current.openPromptIds).toEqual(['prompt-3', 'prompt-1']);
    expect(context.current.activePromptId).toBe('prompt-3');
  });

  it('opens the prompt that was active when there is no stored tab list', async () => {
    // A database migrating in from before tab persistence: one tab, not all of
    // them.
    storedTabs = { activePromptId: 'prompt-2' };

    const context = await renderPromptContext();

    expect(context.current.openPromptIds).toEqual(['prompt-2']);
    expect(context.current.activePromptId).toBe('prompt-2');
  });

  it('opens nothing when the library is empty', async () => {
    promptsOnServer = [];
    storedTabs = { activePromptId: null, openPromptIds: [] };

    const context = await renderPromptContext();

    expect(context.current.openPromptIds).toEqual([]);
    expect(context.current.activePromptId).toBeNull();
  });
});
