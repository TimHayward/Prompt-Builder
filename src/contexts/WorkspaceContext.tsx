'use client';

/**
 * WorkspaceContext
 *
 * Working prompt state: the values entered for the current use of a prompt,
 * held separately from the prompt itself. Filling in `{{customer}}` is using a
 * prompt, not editing it, so nothing here writes to the source — which is what
 * keeps a variable's definition, and its list of choices, intact.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useAppContext } from './AppContext';
import { useToast } from './ToastContext';
import { apiRequest, apiSend, describeApiFailure } from '@/lib/apiClient';
import { debounceKeyed } from '@/utils/debounce';
import type { PromptWorkspace, UpdateWorkspaceRequest } from '@/types/contracts';

type WorkspaceContextType = {
  /** Working values for a prompt; empty when it has never been used. */
  getWorkingValues: (promptId: string) => Record<string, string>;
  /** Merges values into a prompt's working state. */
  setWorkingValues: (promptId: string, values: Record<string, string>) => void;
  /** Drops every working value, leaving the source prompt untouched. */
  clearWorkingValues: (promptId: string) => Promise<void>;
  /** True once a prompt has any working value set. */
  hasWorkingValues: (promptId: string) => boolean;
  isWorkspacesLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const useWorkspaceContext = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
};

const EMPTY_VALUES: Record<string, string> = {};

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { appInitialized } = useAppContext();
  const { showToast } = useToast();

  const [workspaces, setWorkspaces] = useState<Record<string, PromptWorkspace>>({});
  const [isWorkspacesLoading, setIsWorkspacesLoading] = useState(true);

  // Written synchronously by commitWorkspace, so two changes in one tick build
  // on each other rather than on the pre-change state.
  const workspacesRef = useRef(workspaces);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const commitWorkspace = useCallback((workspace: PromptWorkspace) => {
    const next = { ...workspacesRef.current, [workspace.promptId]: workspace };
    workspacesRef.current = next;
    setWorkspaces(next);
  }, []);

  // Debounced per prompt, for the same reason prompt saves are: typing in one
  // prompt's values must not cancel another's pending save.
  const saveWorkspace = useMemo(
    () =>
      debounceKeyed(
        async (workspace: PromptWorkspace) => {
          try {
            const update: UpdateWorkspaceRequest = {
              values: workspace.values,
              sectionOverrides: workspace.sectionOverrides,
            };
            await apiSend(`/api/workspaces/${workspace.promptId}`, 'PUT', update);
          } catch (error) {
            console.error(`Failed to save working values for ${workspace.promptId}:`, error);
            showToastRef.current(describeApiFailure(error, 'Could not save your working values.'));
          }
        },
        1000,
        workspace => workspace.promptId
      ),
    []
  );

  useEffect(() => () => saveWorkspace.cancelAll(), [saveWorkspace]);

  useEffect(() => {
    if (!appInitialized) return;

    const loadWorkspaces = async () => {
      setIsWorkspacesLoading(true);
      try {
        const loaded = await apiRequest<PromptWorkspace[]>('/api/workspaces');
        const byPromptId = loaded.reduce<Record<string, PromptWorkspace>>((all, workspace) => {
          all[workspace.promptId] = workspace;
          return all;
        }, {});
        workspacesRef.current = byPromptId;
        setWorkspaces(byPromptId);
      } catch (error) {
        console.error('Failed to load working values:', error);
        showToast(describeApiFailure(error, 'Could not load your working values.'));
      } finally {
        setIsWorkspacesLoading(false);
      }
    };

    loadWorkspaces();
  }, [appInitialized, showToast]);

  const getWorkingValues = useCallback(
    (promptId: string) => workspaces[promptId]?.values ?? EMPTY_VALUES,
    [workspaces]
  );

  const hasWorkingValues = useCallback(
    (promptId: string) => Object.values(workspaces[promptId]?.values ?? {}).some(value => value !== ''),
    [workspaces]
  );

  const setWorkingValues = useCallback(
    (promptId: string, values: Record<string, string>) => {
      const current = workspacesRef.current[promptId];
      const updated: PromptWorkspace = {
        promptId,
        values: { ...current?.values, ...values },
        sectionOverrides: current?.sectionOverrides ?? {},
      };

      commitWorkspace(updated);
      saveWorkspace(updated);
    },
    [commitWorkspace, saveWorkspace]
  );

  const clearWorkingValues = useCallback(
    async (promptId: string) => {
      // Drop the queued save first: it would otherwise write the values back
      // moments after they were cleared.
      saveWorkspace.cancel(promptId);
      commitWorkspace({ promptId, values: {}, sectionOverrides: {} });

      try {
        await apiSend(`/api/workspaces/${promptId}`, 'DELETE');
      } catch (error) {
        console.error(`Failed to clear working values for ${promptId}:`, error);
        showToast(describeApiFailure(error, 'Could not clear your working values.'));
      }
    },
    [commitWorkspace, saveWorkspace, showToast]
  );

  const value = useMemo(
    () => ({
      getWorkingValues,
      setWorkingValues,
      clearWorkingValues,
      hasWorkingValues,
      isWorkspacesLoading,
    }),
    [getWorkingValues, setWorkingValues, clearWorkingValues, hasWorkingValues, isWorkspacesLoading]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
