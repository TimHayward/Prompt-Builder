/**
 * Q3: saving a hand-written section into the component library.
 *
 * Before this, only a section that already came from a component could be
 * pushed back to it, so text authored in the editor had no route into the
 * library. What matters here is that the component lands in the folder the user
 * picked, and that the section it came from records the origin as a *copy* —
 * invariant 9 — rather than quietly becoming linked, which invariant 10 says
 * has to be asked for.
 *
 * These drive the real Section rather than its header alone, because the text a
 * section holds depends on the edit mode: in 'using' mode — the default —
 * typing produces a workspace override and the stored content stays as it was.
 * A header tested on its own cannot show that, and it is exactly where this
 * first went wrong: the action stayed greyed out for a section the user had
 * just typed into.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/AppContext';
import { PromptProvider, usePromptContext } from '@/contexts/PromptContext';
import { TreeProvider, useTreeContext } from '@/contexts/TreeContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import ComponentModal from '@/components/Modal/ComponentModal';
import Section from '@/components/PromptEditor/Section';
import { findNodeById } from '@/utils/treeUtils';
import type { FolderType, Prompt, Section as SectionType } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const TASK = 'Summarise the incident.';

const section = (content = TASK): SectionType => ({
  id: 'section-1',
  name: 'Task',
  content,
  type: 'instruction',
  open: true,
  dirty: false,
});

const promptFixture = (content = TASK): Prompt =>
  buildPrompt({ id: 'prompt-1', name: 'Incident report', sections: [section(content)] });

/** The library as the API returns it: a flat list the provider builds a tree from. */
const libraryRows = [
  { id: 'root', name: 'Components', item_type: 'folder', parent_id: null, is_expanded: 1 },
  { id: 'writing', name: 'Writing', item_type: 'folder', parent_id: 'root', is_expanded: 0 },
  { id: 'nested', name: 'Nested', item_type: 'folder', parent_id: 'writing', is_expanded: 0 },
];

let promptsOnServer: Prompt[];

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
  if (url === '/api/components' && method === 'GET') return jsonResponse(libraryRows);
  if (url === '/api/workspaces' && method === 'GET') return jsonResponse([]);
  if (url.startsWith('/api/workspaces/')) {
    return jsonResponse({ promptId: 'prompt-1', values: {}, sectionOverrides: {} });
  }
  return jsonResponse({});
};

type Probe = {
  tree: FolderType[];
  prompts: Prompt[];
};

/**
 * Renders one section in the given mode, plus the component editor.
 *
 * The section comes from context rather than a fixture, so the write-back the
 * save performs is visible in what is rendered — and in the probe.
 */
const renderSection = async (editMode: 'using' | 'source' = 'using') => {
  const probe: { current: Probe | null } = { current: null };

  const Host = () => {
    const { prompts } = usePromptContext();
    const { treeData, isTreeLoading } = useTreeContext();
    probe.current = { tree: treeData, prompts };

    const prompt = prompts.find(candidate => candidate.id === 'prompt-1');
    const current = prompt?.sections[0];

    return (
      <>
        <div data-testid="library-loading">{String(isTreeLoading)}</div>
        {current && <Section section={current} promptId="prompt-1" editMode={editMode} index={0} />}
        <ComponentModal />
      </>
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

  await waitFor(() => {
    expect(screen.getByTestId('library-loading').textContent).toBe('false');
    expect(probe.current?.prompts).toHaveLength(1);
  });

  return probe as { current: Probe };
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

/** The component rows inside one folder of the live tree. */
const componentsIn = (tree: FolderType[], folderId: string) => {
  const folder = findNodeById(tree, folderId);
  if (!folder || folder.type !== 'folder') return [];

  return folder.children.filter(child => child.type === 'component');
};

const saveButton = () =>
  screen.getByLabelText('Save Task as a prompt component') as HTMLButtonElement;

const openSaveAsComponent = () => fireEvent.click(saveButton());

/** A form field's current value, without the jest-dom matchers. */
const valueOf = (label: string) =>
  (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
    .value;

describe('saving a section as a prompt component', () => {
  beforeEach(() => {
    promptsOnServer = [promptFixture()];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => mockFetch(String(input), init))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers the action on a section that came from nowhere', async () => {
    await renderSection();

    expect(saveButton().disabled).toBe(false);
  });

  it('disables the action for a section with nothing in it', async () => {
    promptsOnServer = [promptFixture('   ')];

    await renderSection();

    expect(saveButton().disabled).toBe(true);
  });

  it('offers a section typed into while using the prompt, and saves what it shows', async () => {
    // The reported bug: New Section leaves the content empty, and the editor
    // opens in 'using' mode, so typing produces an override rather than
    // touching the stored section. Reading the stored content left the action
    // greyed out over text the user could plainly see.
    promptsOnServer = [promptFixture('')];
    const probe = await renderSection('using');

    expect(saveButton().disabled).toBe(true);

    act(() => typeInSection('Written while using the prompt.'));

    expect(saveButton().disabled).toBe(false);

    act(() => openSaveAsComponent());
    expect(valueOf('Content:')).toBe('Written while using the prompt.');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(componentsIn(probe.current.tree, 'root')).toHaveLength(1));
    expect(componentsIn(probe.current.tree, 'root')[0]).toMatchObject({
      content: 'Written while using the prompt.',
    });
    // Saving to the library is not an edit to the prompt: the override stays an
    // override, and the stored section is untouched.
    expect(probe.current.prompts[0].sections[0].content).toBe('');
  });

  it('saves the source text when the source is what is being edited', async () => {
    const probe = await renderSection('source');

    act(() => typeInSection('Rewritten in the source.'));
    act(() => openSaveAsComponent());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(componentsIn(probe.current.tree, 'root')).toHaveLength(1));
    expect(componentsIn(probe.current.tree, 'root')[0]).toMatchObject({
      content: 'Rewritten in the source.',
    });
  });

  it('opens the editor prefilled with the section', async () => {
    await renderSection();

    act(() => openSaveAsComponent());

    expect(valueOf('Name:')).toBe('Task');
    expect(valueOf('Content:')).toBe(TASK);
    expect(valueOf('Type:')).toBe('instruction');
  });

  it('lists every folder, indented by depth, and defaults to the root', async () => {
    await renderSection();

    act(() => openSaveAsComponent());

    const picker = screen.getByLabelText('Folder:') as HTMLSelectElement;
    expect([...picker.options].map(option => option.value)).toEqual(['root', 'writing', 'nested']);
    // Two non-breaking spaces per level: a select collapses ordinary ones, so
    // the indentation has to be NBSP. Built from the code point rather than
    // typed, so an editor cannot quietly normalise it away.
    const indent = String.fromCharCode(160, 160);
    expect([...picker.options].map(option => option.textContent)).toEqual([
      'Components',
      `${indent}Writing`,
      `${indent.repeat(2)}Nested`,
    ]);
    expect(picker.value).toBe('root');
  });

  it('creates the component in the chosen folder', async () => {
    const probe = await renderSection();

    act(() => openSaveAsComponent());
    fireEvent.change(screen.getByLabelText('Folder:'), { target: { value: 'writing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(componentsIn(probe.current.tree, 'writing')).toHaveLength(1);
    });

    expect(componentsIn(probe.current.tree, 'writing')[0]).toMatchObject({
      name: 'Task',
      content: TASK,
      componentType: 'instruction',
      type: 'component',
    });
    // It went where it was asked to go, and nowhere else.
    expect(componentsIn(probe.current.tree, 'root')).toHaveLength(0);
    expect(componentsIn(probe.current.tree, 'nested')).toHaveLength(0);
  });

  it('records the origin on the section as a copy, not a link', async () => {
    const probe = await renderSection();

    act(() => openSaveAsComponent());
    fireEvent.change(screen.getByLabelText('Folder:'), { target: { value: 'writing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(probe.current.prompts[0].sections[0].linkedComponentId).toBeDefined();
    });

    const saved = probe.current.prompts[0].sections[0];
    const created = componentsIn(probe.current.tree, 'writing')[0];
    expect(saved.linkedComponentId).toBe(created.id);
    expect(saved.originalContent).toBe(TASK);
    // Invariant 10: following the component has to be chosen, so the section is
    // a copy and the editor keeps offering "Link to component".
    expect(saved.linked).toBe(false);
  });

  it('forgets the draft when the editor is cancelled', async () => {
    const probe = await renderSection();

    act(() => openSaveAsComponent());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(componentsIn(probe.current.tree, 'root')).toHaveLength(0);
    expect(probe.current.prompts[0].sections[0].linkedComponentId).toBeUndefined();

    // A second open must not come back seeded from the abandoned one, and must
    // not be treated as an edit of anything.
    act(() => openSaveAsComponent());
    expect(valueOf('Name:')).toBe('Task');
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeNull();
  });
});
