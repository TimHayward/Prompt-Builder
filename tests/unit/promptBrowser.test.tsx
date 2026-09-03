/**
 * I3 and I6 through the UI: tagging a prompt, and finding one again.
 *
 * The search itself is covered as a pure function in promptSearch.test.ts;
 * these check the parts only a rendered browser can show — that choosing a
 * result switches prompt, that a tag reaches the server, and that the filters
 * are wired to the right thing.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import PromptBrowser from '@/components/PromptEditor/PromptBrowser';
import PromptTags from '@/components/PromptEditor/PromptTags';
import type { Prompt } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const DEBOUNCE_MS = 1000;

const promptFixture = (overrides: Partial<Prompt> = {}): Prompt =>
  buildPrompt({
    name: 'Announcement',
    sections: [
      {
        id: 's1',
        name: 'Instruction',
        content: 'Write something.',
        type: 'instruction',
        open: true,
        dirty: false,
      },
    ],
    ...overrides,
  });

const library = [
  promptFixture({ id: 'prompt-1', name: 'Announcement', tags: ['Writing'] }),
  promptFixture({
    id: 'prompt-2',
    num: 2,
    name: 'Tenant review',
    description: 'Security posture of a tenant',
    isFavourite: true,
    tags: ['Security'],
  }),
];

let promptWrites: { url: string; body: Record<string, unknown> }[];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  if (url === '/api/settings' && method === 'GET') {
    return jsonResponse({ settings: null, activePromptId: 'prompt-1' });
  }
  if (url === '/api/prompts' && method === 'GET') {
    return jsonResponse(library);
  }
  if (url === '/api/workspaces' && method === 'GET') {
    return jsonResponse([]);
  }
  if (url.startsWith('/api/prompts/') && method === 'PUT') {
    promptWrites.push({ url, body: body as Record<string, unknown> });
    return jsonResponse(library[0]);
  }
  return jsonResponse({});
};

/**
 * Renders the browser, plus a line showing which prompt is active.
 *
 * The browser stays mounted throughout, as it is in the editor: it resets the
 * query when it opens, so remounting it mid-test would silently clear what the
 * test had typed.
 */
const renderBrowser = async () => {
  const Host = () => {
    const { activePromptId } = usePromptContext();

    return (
      <>
        <div data-testid="active">{activePromptId}</div>
        <PromptBrowser isOpen onClose={() => {}} />
      </>
    );
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <Host />
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  // Waits for the load to land, so a later one cannot disturb the search.
  await waitFor(() => expect(resultNames()).toHaveLength(library.length));
};

/** Renders the tag editor for the first prompt. */
const renderTags = async () => {
  const Host = () => {
    const { prompts, isPromptsLoading } = usePromptContext();
    const prompt = prompts.find(candidate => candidate.id === 'prompt-1');

    if (isPromptsLoading || !prompt) return null;
    return <PromptTags prompt={prompt} />;
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <Host />
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  // Waits for the stored tag, which only appears once the load has landed.
  await waitFor(() => expect(screen.queryByLabelText('Remove tag Writing')).not.toBeNull());
};

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

const search = (value: string) => {
  fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value } });
};

/** The names showing in the results, in order. */
const resultNames = () =>
  screen.queryAllByRole('button').flatMap(button => {
    const name = button.querySelector('.result-name');
    return name ? [name.textContent ?? ''] : [];
  });

const lastSaved = (field: string) => {
  const write = [...promptWrites].reverse().find(candidate => field in candidate.body);
  return write?.body[field];
};

beforeEach(() => {
  promptWrites = [];
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

describe('finding a prompt', () => {
  it('lists everything before anything is typed', async () => {
    await renderBrowser();

    expect(resultNames()).toEqual(['Announcement', 'Tenant review']);
  });

  it('narrows as the query is typed', async () => {
    await renderBrowser();

    search('security');

    // Matched on the description, which the tabs never show.
    expect(resultNames()).toEqual(['Tenant review']);
  });

  it('says why a prompt matched', async () => {
    await renderBrowser();

    search('security');

    expect(screen.getByText('Matched in description, tag')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    await renderBrowser();

    search('nothing like this');

    expect(screen.getByText('No prompt matches that.')).toBeTruthy();
  });

  it('switches to the prompt that was chosen', async () => {
    await renderBrowser();

    search('tenant');
    fireEvent.click(screen.getByText('Tenant review'));

    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('prompt-2'));
  });

  it('shows only favourites when asked', async () => {
    await renderBrowser();

    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));

    expect(resultNames()).toEqual(['Tenant review']);
  });

  it('narrows to a tag, and back again', async () => {
    await renderBrowser();

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }));
    expect(resultNames()).toEqual(['Announcement']);

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }));
    expect(resultNames()).toEqual(['Announcement', 'Tenant review']);
  });
});

describe('tagging a prompt', () => {
  it('saves a tag typed and entered', async () => {
    await renderTags();

    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: 'Microsoft 365' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();

    expect(lastSaved('tags')).toEqual(['Writing', 'Microsoft 365']);
  });

  it('refuses a repeat that differs only in case', async () => {
    await renderTags();

    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: 'writing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();

    expect(promptWrites).toHaveLength(0);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('removes a tag', async () => {
    await renderTags();

    fireEvent.click(screen.getByLabelText('Remove tag Writing'));
    await flush();

    expect(lastSaved('tags')).toEqual([]);
  });
});
