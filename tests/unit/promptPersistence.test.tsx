/**
 * Persistence regressions for PromptContext.
 *
 * Each case mutates a prompt and then asserts that what reaches the API is the
 * post-mutation prompt — the state a reload would restore — rather than the
 * value the mutation started from.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import type { Prompt, Section } from '@/types';

const DEBOUNCE_MS = 1000;

const section = (id: string, content = id): Section => ({
  id,
  name: id,
  content,
  type: 'instruction',
  open: true,
  dirty: false,
});

const promptFixture = (): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Prompt One',
  sections: [section('s1'), section('s2'), section('s3')],
  variables: {},
});

type ContextValue = ReturnType<typeof usePromptContext>;

/** PUT bodies sent to /api/prompts/:id, in order. */
let savedPrompts: Prompt[];
let promptsOnServer: Prompt[];

const mockFetch = (url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';

  if (url === '/api/settings' && method === 'GET') {
    return Promise.resolve(new Response(
      JSON.stringify({ settings: null, activePromptId: 'prompt-1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
  }

  if (url === '/api/settings') {
    return Promise.resolve(new Response('{}', { status: 200 }));
  }

  if (url === '/api/prompts' && method === 'GET') {
    return Promise.resolve(new Response(JSON.stringify(promptsOnServer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  if (url.startsWith('/api/prompts/') && method === 'PUT') {
    const body = JSON.parse(String(init?.body)) as Prompt;
    savedPrompts.push(body);
    promptsOnServer = promptsOnServer.map(p => (p.id === body.id ? body : p));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }

  return Promise.resolve(new Response('{}', { status: 200 }));
};

/** Renders the providers and hands back the live context value. */
const renderPromptContext = async () => {
  const contextRef: { current: ContextValue | null } = { current: null };

  const Probe = () => {
    contextRef.current = usePromptContext();
    return null;
  };

  render(
    <ToastProvider>
      <AppProvider>
        <PromptProvider>
          <Probe />
        </PromptProvider>
      </AppProvider>
    </ToastProvider>
  );

  await waitFor(() => {
    expect(contextRef.current?.isPromptsLoading).toBe(false);
    expect(contextRef.current?.prompts).toHaveLength(promptsOnServer.length);
  });

  return contextRef as { current: ContextValue };
};

/** Runs the debounce window out so queued saves fire. */
const flushSaves = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
  });
};

const sectionIds = (prompt: Prompt) => prompt.sections.map(s => s.id);

describe('PromptContext persistence', () => {
  beforeEach(() => {
    savedPrompts = [];
    promptsOnServer = [promptFixture()];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      mockFetch(String(input), init)
    ));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    // Rendered trees would otherwise pile up: the suite runs without vitest
    // globals, so React Testing Library registers no cleanup of its own.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('saves the reordered sections when a section moves up', async () => {
    const context = await renderPromptContext();

    act(() => context.current.moveSectionUp('prompt-1', 's3'));
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['s1', 's3', 's2']);
  });

  it('saves the reordered sections when a section moves down', async () => {
    const context = await renderPromptContext();

    act(() => context.current.moveSectionDown('prompt-1', 's1'));
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['s2', 's1', 's3']);
  });

  it('saves a drag-to-index reorder', async () => {
    const context = await renderPromptContext();

    act(() => context.current.moveSectionToIndex('prompt-1', 's1', 2));
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['s2', 's3', 's1']);
  });

  it('saves a section inserted in the middle', async () => {
    const context = await renderPromptContext();

    act(() => context.current.addSectionAtIndex('prompt-1', section('inserted'), 1));
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['s1', 'inserted', 's2', 's3']);
  });

  it('saves a deletion', async () => {
    const context = await renderPromptContext();

    act(() => context.current.deleteSection('prompt-1', 's2'));
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['s1', 's3']);
  });

  it('saves an edit to a section', async () => {
    const context = await renderPromptContext();

    act(() => context.current.updateSection('prompt-1', 's2', { content: 'edited' }));
    await flushSaves();

    const saved = savedPrompts.at(-1)!;
    expect(saved.sections.find(s => s.id === 's2')?.content).toBe('edited');
  });

  it('keeps every change when mutations happen in the same tick', async () => {
    const context = await renderPromptContext();

    act(() => {
      context.current.addSectionAtIndex('prompt-1', section('a'), 0);
      context.current.addSectionAtIndex('prompt-1', section('b'), 1);
      context.current.moveSectionUp('prompt-1', 's3');
    });
    await flushSaves();

    expect(sectionIds(savedPrompts.at(-1)!)).toEqual(['a', 'b', 's1', 's3', 's2']);
  });

  it('debounces each prompt separately', async () => {
    promptsOnServer = [promptFixture(), { ...promptFixture(), id: 'prompt-2', name: 'Prompt Two' }];
    const context = await renderPromptContext();

    act(() => context.current.updateSection('prompt-1', 's1', { content: 'edit A' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => context.current.updateSection('prompt-2', 's1', { content: 'edit B' }));
    await flushSaves();

    const savedById = new Map(savedPrompts.map(prompt => [prompt.id, prompt]));
    expect(savedById.get('prompt-1')?.sections[0].content).toBe('edit A');
    expect(savedById.get('prompt-2')?.sections[0].content).toBe('edit B');
  });
});
