'use client';

/**
 * PromptContext
 *
 * Holds the prompt collection and the active prompt, and orchestrates the three
 * layers that do the work: promptMutations decides what a change produces,
 * promptsApi talks to the server, and usePromptPersistence decides when a save
 * is sent and what the user is told if it fails.
 */

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Prompt, Section, ComponentType, Settings } from '@/types';
import { useAppContext } from './AppContext';
import { useToast } from './ToastContext';
import { describeApiFailure } from '@/lib/apiClient';
import * as promptsApi from '@/api/promptsApi';
import * as mutations from '@/domain/promptMutations';
import { usePromptPersistence } from '@/hooks/usePromptPersistence';
import {
  extractVariablesFromSections,
  extractVariableSpecsFromSections,
  VariableSpec,
} from '@/utils/variableUtils';
import type { CreatePromptRequest } from '@/types/contracts';

// Context type definition
type PromptContextType = {
  prompts: Prompt[];
  /**
   * The prompts open as tabs, in tab order. A working set over the library:
   * closing a tab takes an id out of here and leaves the prompt alone.
   */
  openPromptIds: string[];
  /** Opens a prompt as a tab and makes it active; re-opening just activates. */
  openPrompt: (promptId: string) => void;
  /** Closes a tab. The prompt stays saved and stays in Saved Prompts. */
  closePrompt: (promptId: string) => void;
  activePromptId: string | null;
  setActivePromptId: React.Dispatch<React.SetStateAction<string | null>>;
  addPrompt: (
    name?: string,
    options?: { sections?: Section[]; variables?: Record<string, string> }
  ) => Promise<Prompt>;
  duplicatePrompt: (promptIdToDuplicate: string) => Promise<Prompt | null>;
  addSectionToPrompt: (
    promptId: string,
    type?: Settings['defaultSectionType']
  ) => string | undefined;
  updateSection: (
    promptId: string,
    sectionId: string,
    updates: Partial<Omit<Section, 'id'>>
  ) => void;
  deleteSection: (promptId: string, sectionId: string) => void;
  moveSectionUp: (promptId: string, sectionId: string) => void;
  moveSectionDown: (promptId: string, sectionId: string) => void;
  moveSectionToIndex: (promptId: string, sectionId: string, newIndex: number) => void;
  toggleSectionOpen: (promptId: string, sectionId: string) => void;
  deletePrompt: (promptId: string) => void;
  updateSectionFromLinkedComponent: (
    promptId: string,
    sectionId: string,
    component: ComponentType
  ) => void;
  addSectionAtIndex: (promptId: string, section: Section, index: number) => void;
  addSectionFromComponent: (promptId: string, componentData: ComponentType, index: number) => void;
  addNewSectionForEditing: (promptId: string) => void;
  newlyAddedSectionIdForFocus: string | null;
  clearNewlyAddedSectionIdForFocus: () => void;
  /** Re-reads one prompt from the server, dropping any save queued for it. */
  reloadPrompt: (promptId: string) => Promise<void>;
  updatePromptName: (promptId: string, newName: string) => void;
  updatePromptDescription: (promptId: string, description: string) => void;
  togglePromptFavourite: (promptId: string) => void;
  setPromptTags: (promptId: string, tags: string[]) => void;
  markPromptUsed: (promptId: string) => void;
  getPromptVariableNames: (promptId: string) => string[];
  getPromptVariableSpecs: (promptId: string) => VariableSpec[];
  isPromptsLoading: boolean;
};

// No default value: the previous one answered every call with a no-op, so a
// component outside the provider silently did nothing instead of failing.
const PromptContext = createContext<PromptContextType | null>(null);

export const usePromptContext = (): PromptContextType => {
  const context = useContext(PromptContext);
  if (!context) {
    throw new Error('usePromptContext must be used within a PromptProvider');
  }
  return context;
};

type PromptProviderProps = {
  children: ReactNode;
};

export const PromptProvider = ({ children }: PromptProviderProps) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [openPromptIds, setOpenPromptIds] = useState<string[]>([]);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [newlyAddedSectionIdForFocus, setNewlyAddedSectionIdForFocus] = useState<string | null>(
    null
  );
  const [isPromptsLoading, setIsPromptsLoading] = useState<boolean>(true);

  const { settings, appInitialized } = useAppContext();
  const { showToast } = useToast();

  // promptsRef is the read model for mutations. It is written synchronously by
  // commitPrompts, so a mutation always sees the result of the one before it —
  // React state is not readable again until the next render.
  const promptsRef = useRef(prompts);
  const openPromptIdsRef = useRef(openPromptIds);
  const activePromptIdRef = useRef(activePromptId);
  const appInitializedRef = useRef(appInitialized);
  // Set while a new prompt is being created, so the temporary client id is not
  // written to app_config on its way to being replaced by the server's.
  const isCreatingPrompt = useRef(false);

  const persistence = usePromptPersistence(
    () => appInitializedRef.current,
    () => isCreatingPrompt.current
  );

  // Catches state set outside commitPrompts, such as the initial load.
  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  useEffect(() => {
    activePromptIdRef.current = activePromptId;
  }, [activePromptId]);

  useEffect(() => {
    openPromptIdsRef.current = openPromptIds;
  }, [openPromptIds]);

  useEffect(() => {
    appInitializedRef.current = appInitialized;
  }, [appInitialized]);

  /** Applies a new prompt list to both the ref and React state. */
  const commitPrompts = useCallback((nextPrompts: Prompt[]) => {
    promptsRef.current = nextPrompts;
    setPrompts(nextPrompts);
  }, []);

  /** Applies a new tab list to both the ref and React state. */
  const commitOpenPromptIds = useCallback((nextOpenPromptIds: string[]) => {
    openPromptIdsRef.current = nextOpenPromptIds;
    setOpenPromptIds(nextOpenPromptIds);
  }, []);

  const openPrompt = useCallback(
    (promptId: string) => {
      if (!openPromptIdsRef.current.includes(promptId)) {
        commitOpenPromptIds([...openPromptIdsRef.current, promptId]);
      }
      setActivePromptId(promptId);
    },
    [commitOpenPromptIds]
  );

  /**
   * Closes a tab without touching the prompt.
   *
   * When the closed tab was the active one, the neighbour to its left takes
   * over — closing a tab should land you next to where you were, not at the
   * start of the strip. Closing the last tab leaves nothing active, which is a
   * legitimate state now that the library outlives the tabs.
   */
  const closePrompt = useCallback(
    (promptId: string) => {
      const closingIndex = openPromptIdsRef.current.indexOf(promptId);
      if (closingIndex === -1) return;

      const remaining = openPromptIdsRef.current.filter(id => id !== promptId);
      commitOpenPromptIds(remaining);

      if (activePromptIdRef.current === promptId) {
        const neighbour = remaining[Math.max(0, closingIndex - 1)] ?? null;
        setActivePromptId(neighbour);
      }
    },
    [commitOpenPromptIds]
  );

  // Load prompts and activePromptId once the app has its settings. Deliberately
  // not keyed on the settings object: re-fetching on every settings change would
  // replace prompts that have edits still waiting on the autosave debounce.
  useEffect(() => {
    if (!appInitialized) return;

    const fetchInitialData = async () => {
      setIsPromptsLoading(true);

      try {
        const fetchedPrompts = await promptsApi.fetchPrompts();
        commitPrompts(fetchedPrompts);

        const exists = (id: string | null): boolean =>
          id !== null && fetchedPrompts.some(prompt => prompt.id === id);
        const firstPromptId = fetchedPrompts.length > 0 ? fetchedPrompts[0].id : null;

        try {
          const stored = await promptsApi.fetchOpenTabs();

          // Ids for prompts that have since gone are dropped rather than
          // restored as tabs that cannot open.
          const restored = stored.openPromptIds.filter(id => exists(id));
          const active = exists(stored.activePromptId) ? stored.activePromptId : null;

          // An empty tab list beside a library that has prompts means a
          // database from before tab persistence: open the prompt that was
          // known to be showing, rather than all of them or none.
          const fallback = active ?? firstPromptId;
          const opened = restored.length > 0 ? restored : fallback ? [fallback] : [];

          commitOpenPromptIds(opened);
          setActivePromptId(active && opened.includes(active) ? active : (opened[0] ?? null));
        } catch (error) {
          // Not fatal: open the first prompt rather than losing the library.
          console.warn('Failed to fetch the open tabs; opening the first prompt.', error);
          commitOpenPromptIds(firstPromptId ? [firstPromptId] : []);
          setActivePromptId(firstPromptId);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        showToast(describeApiFailure(error, 'Could not load your prompts.'));
        commitPrompts([]);
        commitOpenPromptIds([]);
        setActivePromptId(null);
      } finally {
        setIsPromptsLoading(false);
      }
    };

    fetchInitialData();
  }, [appInitialized, commitPrompts, commitOpenPromptIds, showToast]);

  // Keep the tab strip honest: a tab may only name a prompt that exists, and
  // the active prompt must be one of the open ones. No tab open is a valid
  // state — the library is reachable from Saved Prompts either way — so this
  // deliberately does not reopen anything to fill the gap.
  useEffect(() => {
    if (isPromptsLoading) return;

    const stillOpen = openPromptIds.filter(id => prompts.some(prompt => prompt.id === id));
    // Only written when something actually went, or the effect would set state
    // on every render and re-run itself.
    if (stillOpen.length !== openPromptIds.length) {
      commitOpenPromptIds(stillOpen);
      return;
    }

    if (activePromptId !== null && !stillOpen.includes(activePromptId)) {
      setActivePromptId(stillOpen[0] ?? null);
    }
  }, [prompts, openPromptIds, activePromptId, isPromptsLoading, commitOpenPromptIds]);

  useEffect(() => {
    if (appInitialized && !isPromptsLoading) {
      persistence.queueOpenTabs({ activePromptId, openPromptIds });
    }
  }, [activePromptId, openPromptIds, appInitialized, isPromptsLoading, persistence]);

  /**
   * Applies a mutation to one prompt and persists that exact result.
   *
   * Reading from promptsRef and writing it back synchronously is what keeps
   * successive mutations in the same tick — and the object handed to the API —
   * from being computed against pre-mutation state.
   *
   * @param promptId - The prompt to mutate
   * @param mutate - Produces the updated prompt from the current one
   * @param options - Set persist to false for editor-only changes
   * @returns The updated prompt, or undefined if the prompt is unknown
   */
  const mutatePrompt = useCallback(
    (
      promptId: string,
      mutate: (prompt: Prompt) => Prompt,
      options?: { persist?: boolean }
    ): Prompt | undefined => {
      const currentPrompt = promptsRef.current.find(prompt => prompt.id === promptId);
      if (!currentPrompt) return undefined;

      const updatedPrompt = mutate(currentPrompt);
      commitPrompts(
        promptsRef.current.map(prompt => (prompt.id === promptId ? updatedPrompt : prompt))
      );

      if (options?.persist !== false) {
        persistence.queueSave(updatedPrompt);
      }

      return updatedPrompt;
    },
    [commitPrompts, persistence]
  );

  /**
   * Adds a prompt to the UI before the server confirms it, and takes it back
   * out if the create fails — a tab for a prompt that does not exist is worse
   * than a slower create.
   */
  const createOptimistically = useCallback(
    async (
      request: CreatePromptRequest,
      sections: Section[],
      failureMessage: string
    ): Promise<Prompt> => {
      isCreatingPrompt.current = true;
      const tempClientId = uuidv4();

      const tempPrompt: Prompt = {
        id: tempClientId,
        name: request.name,
        description: request.description ?? '',
        isFavourite: request.isFavourite ?? false,
        tags: request.tags ?? [],
        lastUsedAt: null,
        sections,
        variables: request.variables ?? {},
        num: request.num ?? null,
      };

      commitPrompts([...promptsRef.current, tempPrompt]);
      // A prompt you just made should be the tab you are looking at.
      commitOpenPromptIds([...openPromptIdsRef.current, tempClientId]);
      setActivePromptId(tempClientId);

      try {
        const createdPrompt = await promptsApi.createPrompt(request);
        commitPrompts(
          promptsRef.current.map(prompt => (prompt.id === tempClientId ? createdPrompt : prompt))
        );
        // The temporary id is swapped in place, so the new tab keeps its
        // position in the strip rather than jumping to the end.
        commitOpenPromptIds(
          openPromptIdsRef.current.map(id => (id === tempClientId ? createdPrompt.id : id))
        );
        setActivePromptId(createdPrompt.id);
        return createdPrompt;
      } catch (error) {
        const remaining = promptsRef.current.filter(prompt => prompt.id !== tempClientId);
        commitPrompts(remaining);
        const remainingTabs = openPromptIdsRef.current.filter(id => id !== tempClientId);
        commitOpenPromptIds(remainingTabs);
        if (activePromptIdRef.current === tempClientId) {
          setActivePromptId(remainingTabs[0] ?? null);
        }
        showToast(describeApiFailure(error, failureMessage));
        throw error;
      } finally {
        isCreatingPrompt.current = false;
      }
    },
    [commitPrompts, commitOpenPromptIds, showToast]
  );

  const addPrompt = useCallback(
    async (
      name?: string,
      options?: { sections?: Section[]; variables?: Record<string, string> }
    ): Promise<Prompt> => {
      const promptName =
        name || settings.defaultPromptName || `Prompt ${promptsRef.current.length + 1}`;
      const sections =
        options?.sections ??
        (settings.defaultSectionType
          ? [mutations.newSection(settings.defaultSectionType, 'Section 1')]
          : []);

      return createOptimistically(
        {
          name: promptName,
          sections: sections.map(
            ({
              open,
              dirty,
              editingHeader,
              editingHeaderTempName,
              editingHeaderTempType,
              ...stored
            }) => stored
          ),
          variables: options?.variables ?? {},
          num: promptsRef.current.length + 1,
        },
        sections,
        'Could not create the prompt.'
      );
    },
    [settings.defaultPromptName, settings.defaultSectionType, createOptimistically]
  );

  const duplicatePrompt = useCallback(
    async (promptIdToDuplicate: string): Promise<Prompt | null> => {
      const original = promptsRef.current.find(prompt => prompt.id === promptIdToDuplicate);
      if (!original) {
        console.error('Prompt to duplicate not found');
        return null;
      }

      const sections = mutations.copySectionsForDuplicate(original.sections);

      return createOptimistically(
        {
          name: `${original.name} (Copy)`,
          sections: sections.map(
            ({
              open,
              dirty,
              editingHeader,
              editingHeaderTempName,
              editingHeaderTempType,
              ...stored
            }) => stored
          ),
          variables: original.variables || {},
          num: promptsRef.current.length + 1,
        },
        sections,
        'Could not duplicate the prompt.'
      );
    },
    [createOptimistically]
  );

  const deletePrompt = useCallback(
    async (promptId: string) => {
      // Drop any save still queued for this prompt so it cannot recreate it. A
      // pending edit to a prompt the user is deleting is not worth keeping, and
      // the tab still holds it if the delete fails.
      persistence.cancelSave(promptId);

      try {
        // Deleted on the server first: a prompt that vanishes from the tabs while
        // it still exists in the database is the harder failure to notice.
        await promptsApi.deletePrompt(promptId);
      } catch (error) {
        console.error(`Failed to delete prompt ${promptId}:`, error);
        showToast(describeApiFailure(error, 'Could not delete the prompt.'));
        return;
      }

      commitPrompts(promptsRef.current.filter(prompt => prompt.id !== promptId));

      // A deleted prompt cannot stay open. closePrompt reads the tab list the
      // deletion left behind and picks the next active tab from it.
      closePrompt(promptId);
    },
    [commitPrompts, closePrompt, persistence, showToast]
  );

  const reloadPrompt = useCallback(
    async (promptId: string) => {
      // The server has just been told what this prompt says — by a restore, or
      // by anything else that writes behind the client's back. A save still
      // queued here holds the text that was replaced, so it is dropped rather
      // than allowed to undo the write moments later.
      persistence.cancelSave(promptId);

      try {
        const fetched = await promptsApi.fetchPrompts();
        const updated = fetched.find(prompt => prompt.id === promptId);
        if (!updated) return;

        commitPrompts(
          promptsRef.current.map(prompt => (prompt.id === promptId ? updated : prompt))
        );
      } catch (error) {
        console.error(`Failed to reload prompt ${promptId}:`, error);
        showToast(describeApiFailure(error, 'Could not reload the prompt.'));
      }
    },
    [commitPrompts, persistence, showToast]
  );

  const updatePromptName = useCallback(
    (promptId: string, newName: string) => {
      mutatePrompt(promptId, prompt => mutations.renamePrompt(prompt, newName));
    },
    [mutatePrompt]
  );

  const updatePromptDescription = useCallback(
    (promptId: string, description: string) => {
      mutatePrompt(promptId, prompt => mutations.describePrompt(prompt, description));
    },
    [mutatePrompt]
  );

  const togglePromptFavourite = useCallback(
    (promptId: string) => {
      mutatePrompt(promptId, mutations.toggleFavourite);
    },
    [mutatePrompt]
  );

  const setPromptTags = useCallback(
    (promptId: string, tags: string[]) => {
      mutatePrompt(promptId, prompt => mutations.setTags(prompt, tags));
    },
    [mutatePrompt]
  );

  const markPromptUsed = useCallback(
    (promptId: string) => {
      const at = new Date().toISOString();
      mutatePrompt(promptId, prompt => mutations.markUsed(prompt, at));
    },
    [mutatePrompt]
  );

  const addSectionToPrompt = useCallback(
    (promptId: string, type?: Settings['defaultSectionType']): string | undefined => {
      const section = mutations.newSection(type || settings.defaultSectionType || 'instruction');
      const updated = mutatePrompt(promptId, prompt => mutations.appendSection(prompt, section));

      return updated ? section.id : undefined;
    },
    [mutatePrompt, settings.defaultSectionType]
  );

  const updateSection = useCallback(
    (promptId: string, sectionId: string, updates: Partial<Omit<Section, 'id'>>) => {
      mutatePrompt(promptId, prompt => mutations.updateSectionIn(prompt, sectionId, updates));
    },
    [mutatePrompt]
  );

  const deleteSection = useCallback(
    (promptId: string, sectionId: string) => {
      mutatePrompt(promptId, prompt => mutations.removeSection(prompt, sectionId));
    },
    [mutatePrompt]
  );

  const moveSectionUp = useCallback(
    (promptId: string, sectionId: string) => {
      mutatePrompt(promptId, prompt => mutations.moveSection(prompt, sectionId, 'up'));
    },
    [mutatePrompt]
  );

  const moveSectionDown = useCallback(
    (promptId: string, sectionId: string) => {
      mutatePrompt(promptId, prompt => mutations.moveSection(prompt, sectionId, 'down'));
    },
    [mutatePrompt]
  );

  const moveSectionToIndex = useCallback(
    (promptId: string, sectionId: string, newIndex: number) => {
      mutatePrompt(promptId, prompt => mutations.moveSectionToIndex(prompt, sectionId, newIndex));
    },
    [mutatePrompt]
  );

  const toggleSectionOpen = useCallback(
    (promptId: string, sectionId: string) => {
      // Open/closed is editor state, so this one deliberately does not persist.
      mutatePrompt(promptId, prompt => mutations.toggleSection(prompt, sectionId), {
        persist: false,
      });
    },
    [mutatePrompt]
  );

  const updateSectionFromLinkedComponent = useCallback(
    (promptId: string, sectionId: string, component: ComponentType) => {
      mutatePrompt(promptId, prompt =>
        mutations.applyComponentToSection(prompt, sectionId, component)
      );
    },
    [mutatePrompt]
  );

  const addSectionAtIndex = useCallback(
    (promptId: string, section: Section, index: number) => {
      mutatePrompt(promptId, prompt => mutations.insertSectionAt(prompt, section, index));
    },
    [mutatePrompt]
  );

  const addSectionFromComponent = useCallback(
    (promptId: string, componentData: ComponentType, index: number) => {
      addSectionAtIndex(promptId, mutations.sectionFromComponent(componentData), index);
    },
    [addSectionAtIndex]
  );

  const addNewSectionForEditing = useCallback(
    (promptId: string) => {
      const newSectionId = addSectionToPrompt(promptId);
      if (newSectionId) {
        setNewlyAddedSectionIdForFocus(newSectionId);
      }
    },
    [addSectionToPrompt]
  );

  const clearNewlyAddedSectionIdForFocus = useCallback(() => {
    setNewlyAddedSectionIdForFocus(null);
  }, []);

  // Working values are not kept here: they belong to WorkspaceContext, so that
  // using a prompt cannot rewrite the prompt. What this context still exposes
  // are the variable *definitions* the sections declare.

  const getPromptVariableNames = useCallback(
    (promptId: string): string[] => {
      const prompt = prompts.find(p => p.id === promptId);
      return prompt ? extractVariablesFromSections(prompt.sections) : [];
    },
    [prompts]
  );

  const getPromptVariableSpecs = useCallback(
    (promptId: string): VariableSpec[] => {
      const prompt = prompts.find(p => p.id === promptId);
      return prompt ? extractVariableSpecsFromSections(prompt.sections) : [];
    },
    [prompts]
  );

  return (
    <PromptContext.Provider
      value={{
        prompts,
        openPromptIds,
        openPrompt,
        closePrompt,
        activePromptId,
        setActivePromptId,
        addPrompt,
        duplicatePrompt,
        addSectionToPrompt,
        updateSection,
        deleteSection,
        moveSectionUp,
        moveSectionDown,
        moveSectionToIndex,
        toggleSectionOpen,
        deletePrompt,
        updateSectionFromLinkedComponent,
        addSectionAtIndex,
        addSectionFromComponent,
        addNewSectionForEditing,
        newlyAddedSectionIdForFocus,
        clearNewlyAddedSectionIdForFocus,
        reloadPrompt,
        updatePromptName,
        updatePromptDescription,
        togglePromptFavourite,
        setPromptTags,
        markPromptUsed,
        getPromptVariableNames,
        getPromptVariableSpecs,
        isPromptsLoading,
      }}
    >
      {children}
    </PromptContext.Provider>
  );
};
