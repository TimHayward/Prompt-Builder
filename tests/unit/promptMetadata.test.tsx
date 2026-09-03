/**
 * I2, I4 and I5: a prompt carries a description, a favourite mark, and the
 * time it was last used.
 *
 * The acceptance is that both survive — they have to reach the server through
 * the ordinary save, not just sit in React state — so these drive the real
 * context and read what was sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import ActionBar from '@/components/PromptEditor/ActionBar';
import PromptMetadata from '@/components/PromptEditor/PromptMetadata';
import type { Prompt } from '@/types';

const DEBOUNCE_MS = 1000;

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Announcement',
  description: '',
  isFavourite: false,
  tags: [],
  lastUsedAt: null,
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
  variables: {},
});

/** Every PUT the fake server received. */
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
    return jsonResponse([promptFixture()]);
  }
  if (url === '/api/workspaces' && method === 'GET') {
    return jsonResponse([]);
  }
  if (url.startsWith('/api/prompts/') && method === 'PUT') {
    promptWrites.push({ url, body: body as Record<string, unknown> });
    return jsonResponse(promptFixture());
  }
  return jsonResponse({});
};

/** Renders the metadata row against the real prompt context. */
const renderMetadata = async () => {
  const Host = () => {
    const { prompts, isPromptsLoading } = usePromptContext();
    const prompt = prompts.find(candidate => candidate.id === 'prompt-1');

    if (isPromptsLoading || !prompt) return null;
    return <PromptMetadata prompt={prompt} />;
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

  await waitFor(() => expect(screen.queryByLabelText('Prompt description')).not.toBeNull());
};

/** Renders the action bar, whose Copy button is what "using" a prompt means. */
const renderActionBar = async () => {
  const Host = () => {
    const { isPromptsLoading } = usePromptContext();

    if (isPromptsLoading) return null;
    return <ActionBar activePromptId="prompt-1" systemPrompt="" markdownEnabled={false} />;
  };

  render(
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          <PromptProvider>
            <WorkspaceProvider>
              <Host />
            </WorkspaceProvider>
          </PromptProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );

  await waitFor(() =>
    expect((screen.getByTitle('Copy Prompt') as HTMLButtonElement).disabled).toBe(false)
  );
};

const clickCopy = async () => {
  await act(async () => {
    screen.getByTitle('Copy Prompt').click();
  });
};

const typeDescription = (value: string) => {
  fireEvent.change(screen.getByLabelText('Prompt description'), { target: { value } });
};

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

/** The last saved value of one field. */
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
  // useClipboard takes the modern path only in a secure context; jsdom is not
  // one by default.
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('describing a prompt', () => {
  it('saves what was typed', async () => {
    await renderMetadata();

    typeDescription('Weekly client update');
    await flush();

    expect(lastSaved('description')).toBe('Weekly client update');
  });

  it('leaves the sections alone', async () => {
    await renderMetadata();

    typeDescription('Notes');
    await flush();

    // The description is metadata: it must not rewrite what the prompt says.
    // Editor state (open, dirty) is stripped on the way out, as it always is.
    expect(lastSaved('sections')).toEqual([
      { id: 's1', name: 'Instruction', content: 'Write something.', type: 'instruction' },
    ]);
  });
});

describe('marking a favourite', () => {
  it('starts unmarked and offers to add', async () => {
    await renderMetadata();

    expect(screen.getByLabelText('Add to favourites').getAttribute('aria-pressed')).toBe('false');
  });

  it('saves the mark and offers to remove it', async () => {
    await renderMetadata();

    fireEvent.click(screen.getByLabelText('Add to favourites'));
    await flush();

    expect(lastSaved('isFavourite')).toBe(true);
    expect(screen.getByLabelText('Remove from favourites').getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('unmarks on a second click', async () => {
    await renderMetadata();

    fireEvent.click(screen.getByLabelText('Add to favourites'));
    fireEvent.click(screen.getByLabelText('Remove from favourites'));
    await flush();

    expect(lastSaved('isFavourite')).toBe(false);
    expect(screen.queryByLabelText('Add to favourites')).not.toBeNull();
  });
});

describe('recording a use', () => {
  it('stamps the time when the prompt is copied', async () => {
    await renderActionBar();

    await clickCopy();
    await flush();

    const stamped = lastSaved('lastUsedAt');
    expect(typeof stamped).toBe('string');
    // A readable ISO timestamp, not a Date object that JSON would mangle.
    expect(Number.isNaN(Date.parse(String(stamped)))).toBe(false);
  });

  it('does not stamp anything before a copy', async () => {
    await renderActionBar();
    await flush();

    expect(promptWrites).toHaveLength(0);
  });

  it('stamps nothing when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });

    await renderActionBar();
    await clickCopy();
    await flush();

    // Nothing reached the clipboard, so nothing was used.
    expect(lastSaved('lastUsedAt')).toBeUndefined();
  });
});
