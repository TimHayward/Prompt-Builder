/**
 * A rejected save must reach the user. These render the real providers with a
 * failing API so the path from fetch → ApiError → toast is exercised end to end,
 * rather than trusting that each piece works on its own.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import type { Prompt } from '@/types';

const DEBOUNCE_MS = 1000;

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Prompt One',
  sections: [
    { id: 's1', name: 'Role', content: 'body', type: 'instruction', open: true, dirty: false },
  ],
  variables: {},
});

type ContextValue = ReturnType<typeof usePromptContext>;

/** Set per test: how /api/prompts/:id should answer a save. */
let saveOutcome: 'ok' | 'server-error' | 'network-error';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') {
    return jsonResponse([promptFixture()]);
  }
  if (url.startsWith('/api/prompts/') && method === 'PUT') {
    if (saveOutcome === 'network-error') throw new TypeError('Failed to fetch');
    if (saveOutcome === 'server-error') {
      return jsonResponse({ error: 'Failed to update prompt' }, 500);
    }
    return jsonResponse(promptFixture());
  }
  if (url.startsWith('/api/prompts/') && method === 'DELETE') {
    if (saveOutcome === 'server-error') return jsonResponse({ error: 'Prompt not found' }, 404);
    return jsonResponse({ message: 'Prompt deleted successfully' });
  }
  return jsonResponse({});
};

const renderApp = async () => {
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

  await waitFor(() => expect(contextRef.current?.isPromptsLoading).toBe(false));
  return contextRef as { current: ContextValue };
};

const flushSaves = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

beforeEach(() => {
  saveOutcome = 'ok';
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    mockFetch(String(input), init)
  ));
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  // Not automatic: the suite runs without vitest globals, so React Testing
  // Library never registers its own cleanup and rendered trees would pile up.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('failed autosave', () => {
  it('tells the user when the server rejects the save', async () => {
    const context = await renderApp();
    saveOutcome = 'server-error';

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));
    await flushSaves();

    expect(await screen.findByText('Failed to update prompt')).toBeTruthy();
  });

  it('tells the user when the server cannot be reached', async () => {
    const context = await renderApp();
    saveOutcome = 'network-error';

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));
    await flushSaves();

    expect(await screen.findByText(/not saved/)).toBeTruthy();
  });

  it('says nothing when the save succeeds', async () => {
    const context = await renderApp();

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));
    await flushSaves();

    expect(screen.queryByRole('status')?.textContent).toBe('');
  });
});

describe('failed deletion', () => {
  it('keeps the prompt visible and reports the failure', async () => {
    const context = await renderApp();
    saveOutcome = 'server-error';

    await act(async () => {
      await context.current.deletePrompt('prompt-1');
    });

    // Pessimistic delete: the tab is still there because the server said no.
    expect(context.current.prompts.map(prompt => prompt.id)).toEqual(['prompt-1']);
    expect(await screen.findByText('Prompt not found')).toBeTruthy();
  });

  it('removes the prompt once the server confirms', async () => {
    const context = await renderApp();

    await act(async () => {
      await context.current.deletePrompt('prompt-1');
    });

    expect(context.current.prompts).toEqual([]);
  });
});
