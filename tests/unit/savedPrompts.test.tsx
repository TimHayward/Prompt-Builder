/**
 * Q1's sidebar half: the saved library, and the one place a prompt is deleted.
 *
 * Deleting used to be a click on a tab's X with nothing in the way. Now that it
 * lives here and nowhere else, the thing worth pinning down is that it asks
 * first, and that declining leaves the prompt alone.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import SavedPrompts from '@/components/Sidebar/SavedPrompts';
import type { Prompt } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const library = [
  buildPrompt({ id: 'prompt-1', name: 'Announcement' }),
  buildPrompt({ id: 'prompt-2', num: 2, name: 'Tenant review', isFavourite: true }),
  buildPrompt({ id: 'prompt-3', num: 3, name: 'Incident report' }),
];

let promptsOnServer: Prompt[];
let deletedIds: string[];

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({
      settings: null,
      activePromptId: 'prompt-1',
      openPromptIds: ['prompt-1'],
    });
  }
  if (url === '/api/prompts' && method === 'GET') return jsonResponse(promptsOnServer);
  if (url.startsWith('/api/prompts/') && method === 'DELETE') {
    const id = url.slice('/api/prompts/'.length);
    deletedIds.push(id);
    promptsOnServer = promptsOnServer.filter(prompt => prompt.id !== id);
    return jsonResponse({});
  }
  return jsonResponse({});
};

/** Renders the list, plus a line naming the open tabs. */
const renderSavedPrompts = async () => {
  const Tabs = () => {
    const { openPromptIds } = usePromptContext();
    return <div data-testid="tabs">{openPromptIds.join(',')}</div>;
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <Tabs />
            <SavedPrompts />
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Announcement')).toBeDefined();
  });
};

const openTabs = () => screen.getByTestId('tabs').textContent;

describe('SavedPrompts', () => {
  beforeEach(() => {
    promptsOnServer = [...library];
    deletedIds = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => mockFetch(String(input), init))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists every saved prompt, whether or not it is open', async () => {
    await renderSavedPrompts();

    expect(openTabs()).toBe('prompt-1');
    ['Announcement', 'Tenant review', 'Incident report'].forEach(name =>
      expect(screen.getByText(name)).toBeDefined()
    );
  });

  it('narrows the list as the filter is typed', async () => {
    await renderSavedPrompts();

    fireEvent.change(screen.getByLabelText('Filter saved prompts'), {
      target: { value: 'incident' },
    });

    expect(screen.queryByText('Incident report')).not.toBeNull();
    expect(screen.queryByText('Announcement')).toBeNull();
    expect(screen.queryByText('Tenant review')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    await renderSavedPrompts();

    fireEvent.change(screen.getByLabelText('Filter saved prompts'), {
      target: { value: 'nothing like this' },
    });

    expect(screen.queryByText('No prompt matches that.')).not.toBeNull();
  });

  it('opens a prompt that is not in the tab strip', async () => {
    await renderSavedPrompts();

    act(() => {
      fireEvent.click(screen.getByTitle('Open Incident report'));
    });

    expect(openTabs()).toBe('prompt-1,prompt-3');
  });

  it('deletes only after the confirmation is accepted', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderSavedPrompts();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete Tenant review'));
    });

    // The message has to name what is going, and that the working values go too.
    expect(confirm.mock.calls[0][0]).toMatch(/Tenant review[\s\S]*working values/);
    expect(deletedIds).toEqual(['prompt-2']);
    await waitFor(() => expect(screen.queryByText('Tenant review')).toBeNull());
  });

  it('leaves the prompt alone when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderSavedPrompts();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete Tenant review'));
    });

    expect(deletedIds).toEqual([]);
    expect(screen.queryByText('Tenant review')).not.toBeNull();
  });

  it('says the library is empty rather than showing a bare list', async () => {
    promptsOnServer = [];

    render(
      <ToastProvider>
        <SaveStateProvider>
          <AppProvider>
            <PromptProvider>
              <SavedPrompts />
            </PromptProvider>
          </AppProvider>
        </SaveStateProvider>
      </ToastProvider>
    );

    await waitFor(() => expect(screen.queryByText('No prompts saved yet.')).not.toBeNull());
  });
});
