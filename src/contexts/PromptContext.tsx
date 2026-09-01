/**
 * PromptContext
 * Manages prompts and their sections
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';
import { Prompt, Section, ComponentType, Settings } from "@/types";
import { useAppContext } from './AppContext';
import { debounce, debounceKeyed } from "@/utils/debounce";
import { extractVariablesFromSections, extractVariableSpecsFromSections, VariableSpec } from "@/utils/variableUtils";

// Context type definition
type PromptContextType = {
  prompts: Prompt[];
  setPrompts: React.Dispatch<React.SetStateAction<Prompt[]>>;
  activePromptId: string | null;
  setActivePromptId: React.Dispatch<React.SetStateAction<string | null>>;
  addPrompt: (name?: string, options?: { sections?: Section[]; variables?: Record<string, string> }) => Promise<Prompt>;
  duplicatePrompt: (promptIdToDuplicate: string) => Promise<Prompt | null>;
  addSectionToPrompt: (promptId: string, type?: Settings['defaultSectionType']) => string | undefined;
  updateSection: (promptId: string, sectionId: string, updates: Partial<Omit<Section, "id">>) => void;
  deleteSection: (promptId: string, sectionId: string) => void;
  moveSectionUp: (promptId: string, sectionId: string) => void;
  moveSectionDown: (promptId: string, sectionId: string) => void;
  moveSectionToIndex: (promptId: string, sectionId: string, newIndex: number) => void;
  toggleSectionOpen: (promptId: string, sectionId: string) => void;
  deletePrompt: (promptId: string) => void;
  updateSectionFromLinkedComponent: (promptId: string, sectionId: string, component: ComponentType) => void;
  getCompiledPromptText: (promptId: string) => string;
  addSectionAtIndex: (promptId: string, section: Section, index: number) => void;
  addSectionFromComponent: (promptId: string, componentData: ComponentType, index: number) => void;
  addNewSectionForEditing: (promptId: string) => void;
  newlyAddedSectionIdForFocus: string | null;
  clearNewlyAddedSectionIdForFocus: () => void;
  updatePromptName: (promptId: string, newName: string) => void;
  updatePromptVariables: (promptId: string, variables: Record<string, string>) => void;
  getPromptVariables: (promptId: string) => Record<string, string>;
  getPromptVariableNames: (promptId: string) => string[];
  getPromptVariableSpecs: (promptId: string) => VariableSpec[];
  isPromptsLoading: boolean;
};

// Create context with default values
const PromptContext = createContext<PromptContextType>({
  prompts: [],
  setPrompts: () => {},
  activePromptId: null,
  setActivePromptId: () => {},
  addPrompt: () => Promise.resolve({ id: uuidv4(), num: 0, name: "", sections: [] }),
  duplicatePrompt: () => Promise.resolve(null),
  addSectionToPrompt: () => undefined,
  updateSection: () => {},
  deleteSection: () => {},
  moveSectionUp: () => {},
  moveSectionDown: () => {},
  moveSectionToIndex: () => {},
  toggleSectionOpen: () => {},
  deletePrompt: () => {},
  updateSectionFromLinkedComponent: () => {},
  getCompiledPromptText: () => "",
  addSectionAtIndex: () => {},
  addSectionFromComponent: () => {},
  addNewSectionForEditing: () => {},
  newlyAddedSectionIdForFocus: null,
  clearNewlyAddedSectionIdForFocus: () => {},
  updatePromptName: () => {},
  updatePromptVariables: () => {},
  getPromptVariables: () => ({}),
  getPromptVariableNames: () => [],
  getPromptVariableSpecs: () => [],
  isPromptsLoading: true, // Default to true
});

// Hook for using this context
export const usePromptContext = () => useContext(PromptContext);

// Provider component
type PromptProviderProps = {
  children: ReactNode;
};

export const PromptProvider = ({ children }: PromptProviderProps) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [newlyAddedSectionIdForFocus, setNewlyAddedSectionIdForFocus] = useState<string | null>(null);
  const { settings, appInitialized } = useAppContext();
  const [isPromptsLoading, setIsPromptsLoading] = useState<boolean>(true);

  // promptsRef is the read model for mutations. It is written synchronously by
  // commitPrompts, so a mutation always sees the result of the one before it —
  // React state is not readable again until the next render.
  const promptsRef = React.useRef(prompts);
  const activePromptIdRef = React.useRef(activePromptId);
  const activePromptIdChangeIsFromAddPrompt = useRef(false);
  // Read inside the debounced savers, which must not be rebuilt when it flips.
  const appInitializedRef = useRef(appInitialized);

  // Catches state set outside commitPrompts (initial load, the exposed setPrompts).
  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  useEffect(() => {
    activePromptIdRef.current = activePromptId;
  }, [activePromptId]);

  useEffect(() => {
    appInitializedRef.current = appInitialized;
  }, [appInitialized]);

  /** Applies a new prompt list to both the ref and React state. */
  const commitPrompts = useCallback((nextPrompts: Prompt[]) => {
    promptsRef.current = nextPrompts;
    setPrompts(nextPrompts);
  }, []);

  // Load prompts and activePromptId once the app has its settings. Deliberately
  // not keyed on the settings object: re-fetching on every settings change would
  // replace prompts that have edits still waiting on the autosave debounce.
  useEffect(() => {
    if (appInitialized) {
      const fetchInitialData = async () => {
        setIsPromptsLoading(true);
        try {
          const promptsResponse = await fetch('/api/prompts');
          if (!promptsResponse.ok) throw new Error('Failed to fetch prompts');
          const fetchedPrompts = await promptsResponse.json();
          commitPrompts(fetchedPrompts);

          // The active prompt lives alongside the settings in app_config.
          const settingsResponse = await fetch('/api/settings');
          if (!settingsResponse.ok) {
            // Not fatal: fall back to the first prompt rather than losing the library.
            console.warn('Failed to fetch the active prompt ID; defaulting to the first prompt.');
            setActivePromptId(fetchedPrompts.length > 0 ? fetchedPrompts[0].id : null);
          } else {
            const { activePromptId: storedActivePromptId } = await settingsResponse.json();
            const storedPromptExists = fetchedPrompts.some(
              (prompt: Prompt) => prompt.id === storedActivePromptId
            );
            setActivePromptId(
              storedPromptExists
                ? storedActivePromptId
                : (fetchedPrompts.length > 0 ? fetchedPrompts[0].id : null)
            );
          }

        } catch (error) {
          console.error("Error loading initial data:", error);
          commitPrompts([]);
          setActivePromptId(null);
        } finally {
          setIsPromptsLoading(false);
        }
      };
      fetchInitialData();
    }
  }, [appInitialized, commitPrompts]);

  // Effect to set first prompt as active if activePromptId is null and prompts are loaded
  useEffect(() => {
    if (!isPromptsLoading && prompts.length > 0 && !prompts.find(p => p.id === activePromptId)) {
        setActivePromptId(prompts[0].id);
    } else if (!isPromptsLoading && prompts.length === 0) {
        setActivePromptId(null);
    }
  }, [prompts, activePromptId, isPromptsLoading]);

  // /api/settings owns app_config, which is where active_prompt_id is stored.
  const saveActivePromptIdToApi = useMemo(() => debounce(async (currentActivePromptId: string | null) => {
    if (!appInitializedRef.current || activePromptIdChangeIsFromAddPrompt.current) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePromptId: currentActivePromptId }),
      });
    } catch (error) {
      console.error('Failed to save active prompt ID:', error);
    }
  }, 1000), []);

  useEffect(() => {
    if (appInitialized && !isPromptsLoading) {
        saveActivePromptIdToApi(activePromptId);
    }
  }, [activePromptId, appInitialized, isPromptsLoading, saveActivePromptIdToApi]);


  // Debounced per prompt id: saving prompt B must never cancel a pending save
  // of prompt A, which one shared timer used to do.
  const updatePromptInApi = useMemo(() => debounceKeyed(async (promptToUpdate: Prompt) => {
    if (!appInitializedRef.current) return;
    try {
      // Strip the UI-only header editing state before it reaches the API.
      const { sections, ...restOfPrompt } = promptToUpdate;
      const sectionsForApi = sections.map(({ editingHeader, editingHeaderTempName, editingHeaderTempType, ...section }) => section);

      await fetch(`/api/prompts/${promptToUpdate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...restOfPrompt, sections: sectionsForApi }),
      });
    } catch (error) {
      console.error(`Failed to update prompt ${promptToUpdate.id}:`, error);
    }
  }, 1000, promptToUpdate => promptToUpdate.id), []);

  // Pending saves are per prompt, so drop them all rather than leaking timers.
  useEffect(() => () => updatePromptInApi.cancelAll(), [updatePromptInApi]);

  /**
   * Applies a mutation to one prompt and persists that exact result.
   *
   * Reading from promptsRef and writing it back synchronously is what keeps
   * successive mutations in the same tick — and the object handed to the API —
   * from being computed against pre-mutation state.
   *
   * @param promptId - The prompt to mutate
   * @param mutate - Produces the updated prompt from the current one
   * @param options - Set persist to false for UI-only changes
   * @returns The updated prompt, or undefined if the prompt is unknown
   */
  const mutatePrompt = useCallback((
    promptId: string,
    mutate: (prompt: Prompt) => Prompt,
    options?: { persist?: boolean }
  ): Prompt | undefined => {
    const currentPrompt = promptsRef.current.find(p => p.id === promptId);
    if (!currentPrompt) return undefined;

    const updatedPrompt = mutate(currentPrompt);
    commitPrompts(promptsRef.current.map(p => (p.id === promptId ? updatedPrompt : p)));

    if (options?.persist !== false) {
      updatePromptInApi(updatedPrompt);
    }

    return updatedPrompt;
  }, [commitPrompts, updatePromptInApi]);

  const addPrompt = useCallback(async (name?: string, options?: { sections?: Section[]; variables?: Record<string, string> }): Promise<Prompt> => {
    activePromptIdChangeIsFromAddPrompt.current = true;
    const tempClientId = uuidv4();

    const newPromptName = name || settings.defaultPromptName || `Prompt ${promptsRef.current.length + 1}`;
    const initialSections: Section[] = options?.sections
      ? options.sections
      : settings.defaultSectionType
        ? [{
            id: uuidv4(),
            name: 'Section 1',
            content: '',
            type: settings.defaultSectionType,
            open: true,
            dirty: false,
          }]
        : [];
    const initialVariables: Record<string, string> = options?.variables ?? {};

    // Data for the API - ensure it matches what the backend expects for a new prompt.
    // 'open' and 'dirty' are primarily UI concerns but might be stored if desired.
    // For now, let's assume the backend can handle the full Section object or ignore extra fields.
    const promptDataForApi = {
      name: newPromptName,
      sections: initialSections, // Sending full initial sections
      variables: initialVariables,
      num: promptsRef.current.length + 1, // Or other logic for 'num'
    };

    const tempPrompt: Prompt = {
      id: tempClientId,
      name: newPromptName,
      sections: initialSections,
      variables: initialVariables,
      num: promptDataForApi.num,
    };

    commitPrompts([...promptsRef.current, tempPrompt]);
    setActivePromptId(tempPrompt.id);

    const rollbackOptimisticPrompt = () => {
      const remainingPrompts = promptsRef.current.filter(p => p.id !== tempClientId);
      commitPrompts(remainingPrompts);
      if (activePromptIdRef.current === tempClientId) {
        setActivePromptId(remainingPrompts.length > 0 ? remainingPrompts[0].id : null);
      }
    };

    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptDataForApi),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error('Failed to create prompt:', response.status, errorData);
        rollbackOptimisticPrompt();
        throw new Error(`Failed to create prompt: ${errorData.message || response.statusText}`);
      }

      const createdPrompt: Prompt = await response.json();

      commitPrompts(promptsRef.current.map(p => (p.id === tempClientId ? createdPrompt : p)));
      setActivePromptId(createdPrompt.id);

      return createdPrompt;
    } catch (error) {
      console.error("Error in addPrompt:", error);
      rollbackOptimisticPrompt();
      throw error;
    } finally {
      activePromptIdChangeIsFromAddPrompt.current = false;
    }
  }, [settings.defaultPromptName, settings.defaultSectionType, commitPrompts, setActivePromptId, promptsRef, activePromptIdRef]);

  const duplicatePrompt = useCallback(async (promptIdToDuplicate: string): Promise<Prompt | null> => {
    console.warn("duplicatePrompt is a placeholder and not fully implemented.");
    const promptToDuplicate = promptsRef.current.find(p => p.id === promptIdToDuplicate);
    if (!promptToDuplicate) {
      console.error("Prompt to duplicate not found");
      return null;
    }

    // Create a deep copy of sections with new IDs
    const newSections: Section[] = promptToDuplicate.sections.map(section => ({
      ...section,
      id: uuidv4(),
      // Reset UI-specific states if necessary
      dirty: false,
      editingHeader: false,
      editingHeaderTempName: undefined,
      editingHeaderTempType: undefined,
    }));

    const newPromptName = `${promptToDuplicate.name} (Copy)`;
    
    // Use a structure similar to addPrompt for API interaction
    activePromptIdChangeIsFromAddPrompt.current = true; // Manage flag if it becomes active immediately
    const tempClientId = uuidv4();

    const promptDataForApi = {
      name: newPromptName,
      sections: newSections, // Send new sections
      variables: promptToDuplicate.variables || {}, // Copy variables from original prompt
      num: promptsRef.current.length + 1, // Or determine num differently
    };

    const tempPrompt: Prompt = {
      id: tempClientId,
      name: newPromptName,
      sections: newSections,
      variables: promptToDuplicate.variables || {},
      num: promptDataForApi.num,
    };
    
    commitPrompts([...promptsRef.current, tempPrompt]);
    setActivePromptId(tempPrompt.id); // Optionally make the new duplicate active

    const rollbackOptimisticPrompt = () => {
      const remainingPrompts = promptsRef.current.filter(p => p.id !== tempClientId);
      commitPrompts(remainingPrompts);
      if (activePromptIdRef.current === tempClientId) {
        setActivePromptId(remainingPrompts.length > 0 ? remainingPrompts[0].id : null);
      }
    };

    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptDataForApi),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error('Failed to create duplicated prompt:', errorData);
        rollbackOptimisticPrompt();
        throw new Error(`Failed to create duplicated prompt: ${errorData.message || response.statusText}`);
      }
      const createdPrompt: Prompt = await response.json();
      commitPrompts(promptsRef.current.map(p => (p.id === tempClientId ? createdPrompt : p)));
      setActivePromptId(createdPrompt.id); // Ensure active ID is the server one
      return createdPrompt;
    } catch (error) {
      console.error("Error duplicating prompt:", error);
      rollbackOptimisticPrompt();
      throw error;
    } finally {
      activePromptIdChangeIsFromAddPrompt.current = false;
    }
  }, [commitPrompts, setActivePromptId, promptsRef, activePromptIdRef]);

  const deletePrompt = useCallback(async (promptId: string) => {
    // Drop any save still queued for this prompt so it cannot recreate it.
    updatePromptInApi.cancel(promptId);

    const remainingPrompts = promptsRef.current.filter(p => p.id !== promptId);
    commitPrompts(remainingPrompts);
    if (activePromptIdRef.current === promptId) {
      // Reads the list the deletion produced, not the one before it.
      setActivePromptId(remainingPrompts.length > 0 ? remainingPrompts[0].id : null);
    }
    try {
      await fetch(`/api/prompts/${promptId}`, { method: 'DELETE' });
    } catch (error) {
      console.error(`Failed to delete prompt ${promptId}:`, error);
      // Potentially re-add prompt to UI or notify user
    }
  }, [commitPrompts, setActivePromptId, promptsRef, activePromptIdRef, updatePromptInApi]);

  const updatePromptName = useCallback((promptId: string, newName: string) => {
    mutatePrompt(promptId, prompt => ({ ...prompt, name: newName }));
  }, [mutatePrompt]);

  const addSectionToPrompt = useCallback((promptId: string, type?: Settings['defaultSectionType']): string | undefined => {
    const sectionType = type || settings.defaultSectionType || 'instruction';
    const newSection: Section = {
      id: uuidv4(),
      name: 'New Section',
      content: '',
      type: sectionType,
      open: true,
      dirty: false,
    };
    const updatedPrompt = mutatePrompt(promptId, prompt => ({
      ...prompt,
      sections: [...prompt.sections, newSection],
    }));

    return updatedPrompt ? newSection.id : undefined;
  }, [mutatePrompt, settings.defaultSectionType]);

  const updateSection = useCallback((promptId: string, sectionId: string, updates: Partial<Omit<Section, "id">>) => {
    mutatePrompt(promptId, prompt => ({
      ...prompt,
      sections: prompt.sections.map(s =>
        // An edit marks the section dirty unless the caller says otherwise, which
        // is how saving a section back to its component clears the flag.
        s.id === sectionId ? { ...s, ...updates, dirty: updates.dirty ?? true } : s
      ),
    }));
  }, [mutatePrompt]);

  const deleteSection = useCallback((promptId: string, sectionId: string) => {
    mutatePrompt(promptId, prompt => ({
      ...prompt,
      sections: prompt.sections.filter(s => s.id !== sectionId),
    }));
  }, [mutatePrompt]);

  const moveSection = useCallback((promptId: string, sectionId: string, direction: 'up' | 'down') => {
    mutatePrompt(promptId, prompt => {
      const index = prompt.sections.findIndex(s => s.id === sectionId);
      if (index === -1) return prompt;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prompt.sections.length) return prompt;

      const newSections = [...prompt.sections];
      const [movedSection] = newSections.splice(index, 1);
      newSections.splice(newIndex, 0, movedSection);
      return { ...prompt, sections: newSections };
    });
  }, [mutatePrompt]);

  const moveSectionUp = useCallback((promptId: string, sectionId: string) => {
    moveSection(promptId, sectionId, 'up');
  }, [moveSection]);

  const moveSectionDown = useCallback((promptId: string, sectionId: string) => {
    moveSection(promptId, sectionId, 'down');
  }, [moveSection]);

  const moveSectionToIndex = useCallback((promptId: string, sectionId: string, newIndex: number) => {
    mutatePrompt(promptId, prompt => {
      const oldIndex = prompt.sections.findIndex(s => s.id === sectionId);
      if (oldIndex === -1) return prompt;

      const newSections = [...prompt.sections];
      const [movedSection] = newSections.splice(oldIndex, 1);
      newSections.splice(newIndex, 0, movedSection);
      return { ...prompt, sections: newSections };
    });
  }, [mutatePrompt]);

  const toggleSectionOpen = useCallback((promptId: string, sectionId: string) => {
    // Open/closed is UI-only, so this one deliberately does not persist.
    mutatePrompt(promptId, prompt => ({
      ...prompt,
      sections: prompt.sections.map(s =>
        s.id === sectionId ? { ...s, open: !s.open } : s
      ),
    }), { persist: false });
  }, [mutatePrompt]);

  const updateSectionFromLinkedComponent = useCallback((promptId: string, sectionId: string, component: ComponentType) => {
    mutatePrompt(promptId, prompt => ({
      ...prompt,
      sections: prompt.sections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              content: component.content || '',
              type: component.componentType || s.type,
              linkedComponentId: component.id,
              name: component.name, // The section takes the component's name too
              dirty: true,
            }
          : s
      ),
    }));
  }, [mutatePrompt]);

  const getCompiledPromptText = useCallback((promptId: string): string => {
    const prompt = promptsRef.current.find(p => p.id === promptId);
    if (!prompt) return "";
    // Simple compilation for now, can be expanded
    return prompt.sections.map(s => `# ${s.type}: ${s.name}\n${s.content}`).join('\n\n');
  }, [promptsRef]);

  const addSectionAtIndex = useCallback((promptId: string, section: Section, index: number) => {
    mutatePrompt(promptId, prompt => {
      const newSections = [...prompt.sections];
      newSections.splice(index, 0, section);
      return { ...prompt, sections: newSections };
    });
  }, [mutatePrompt]);

  const addSectionFromComponent = useCallback((promptId: string, componentData: ComponentType, index: number) => {
    const newSection: Section = {
      id: uuidv4(),
      name: componentData.name,
      content: componentData.content || '',
      type: componentData.componentType || 'instruction', // Corrected: componentType
      open: true,
      dirty: false,
      linkedComponentId: componentData.id, // Set linkedComponentId
      // isLinked removed
    };
    addSectionAtIndex(promptId, newSection, index);
  }, [addSectionAtIndex]);

  const addNewSectionForEditing = useCallback((promptId: string) => {
    const newSectionId = addSectionToPrompt(promptId);
    if (newSectionId) {
      setNewlyAddedSectionIdForFocus(newSectionId);
    }
  }, [addSectionToPrompt, setNewlyAddedSectionIdForFocus]);

  const clearNewlyAddedSectionIdForFocus = useCallback(() => {
    setNewlyAddedSectionIdForFocus(null);
  }, [setNewlyAddedSectionIdForFocus]);

  const updatePromptVariables = useCallback((promptId: string, variables: Record<string, string>) => {
    mutatePrompt(promptId, prompt => ({
      ...prompt,
      variables: { ...prompt.variables, ...variables },
    }));
  }, [mutatePrompt]);

  const getPromptVariables = useCallback((promptId: string): Record<string, string> => {
    const prompt = promptsRef.current.find(p => p.id === promptId);
    return prompt?.variables || {};
  }, [promptsRef]);

  const getPromptVariableNames = useCallback((promptId: string): string[] => {
    // Find the prompt from the prompts array (current render state, not stale ref)
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) {
      return [];
    }
    return extractVariablesFromSections(prompt.sections);
  }, [prompts]);

  const getPromptVariableSpecs = useCallback((promptId: string): VariableSpec[] => {
    // Find the prompt from the prompts array (current render state, not stale ref)
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) {
      return [];
    }
    return extractVariableSpecsFromSections(prompt.sections);
  }, [prompts]);

  return (
    <PromptContext.Provider
      value={{
        prompts,
        setPrompts,
        activePromptId,
        setActivePromptId,
        addPrompt,
        duplicatePrompt, // Ensure it's in the value
        addSectionToPrompt,
        updateSection,
        deleteSection,
        moveSectionUp,
        moveSectionDown,
        moveSectionToIndex,
        toggleSectionOpen,
        deletePrompt,
        updateSectionFromLinkedComponent,
        getCompiledPromptText,
        addSectionAtIndex,
        addSectionFromComponent,
        addNewSectionForEditing,
        newlyAddedSectionIdForFocus,
        clearNewlyAddedSectionIdForFocus,
        updatePromptName,
        updatePromptVariables,
        getPromptVariables,
        getPromptVariableNames,
        getPromptVariableSpecs,
        isPromptsLoading,
      }}
    >
      {children}
    </PromptContext.Provider>
  );
};