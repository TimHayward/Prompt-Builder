/**
 * D5: the user can tell whether their changes are stored.
 *
 * The indicator has to follow the actual request, not a local "I called save"
 * flag — the failure mode being a prompt that says Saved while the write was
 * rejected. So this drives the real contexts against a real (mocked) API.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import SaveStateIndicator from '@/components/PromptEditor/SaveStateIndicator';
import type { Prompt } from '@/types';

const DEBOUNCE_MS = 1000;

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Prompt One',
  sections: [{ id: 's1', name: 'Role', content: 'body', type: 'instruction', open: true, dirty: false }],
  variables: {},
});

let saveOutcome: 'ok' | 'server-error';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') return jsonResponse([promptFixture()]);
  if (url.startsWith('/api/prompts/') && method === 'PUT') {
    return saveOutcome === 'server-error'
      ? jsonResponse({ error: 'Failed to update prompt' }, 500)
      : jsonResponse(promptFixture());
  }
  return jsonResponse({});
};

type ContextValue = ReturnType<typeof usePromptContext>;

const renderWithIndicator = async () => {
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
            <SaveStateIndicator />
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => expect(contextRef.current?.isPromptsLoading).toBe(false));
  return contextRef as { current: ContextValue };
};

const indicatorText = () => document.querySelector('.save-state')?.textContent;

beforeEach(() => {
  saveOutcome = 'ok';
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    mockFetch(String(input), init)
  ));
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the save state indicator', () => {
  it('starts out saying everything is saved', async () => {
    await renderWithIndicator();

    expect(indicatorText()).toBe('Saved');
  });

  it('says there are unsaved changes while a save is still queued', async () => {
    const context = await renderWithIndicator();

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));

    // The debounce has not elapsed, so nothing has been sent yet.
    expect(indicatorText()).toBe('Unsaved changes');
  });

  it('returns to saved once the write completes', async () => {
    const context = await renderWithIndicator();

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });

    await waitFor(() => expect(indicatorText()).toBe('Saved'));
  });

  it('says the save failed when the server rejects it, rather than Saved', async () => {
    const context = await renderWithIndicator();
    saveOutcome = 'server-error';

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edited' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });

    await waitFor(() => expect(indicatorText()).toBe('Save failed'));
  });

  it('recovers once a later save succeeds', async () => {
    const context = await renderWithIndicator();
    saveOutcome = 'server-error';

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'first' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });
    await waitFor(() => expect(indicatorText()).toBe('Save failed'));

    saveOutcome = 'ok';
    act(() => context.current.updateSection('prompt-1', 's1', { content: 'second' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });

    await waitFor(() => expect(indicatorText()).toBe('Saved'));
  });
});
