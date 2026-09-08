'use client';

/**
 * FrameworkContext
 *
 * The frameworks a user can choose from, loaded from the database rather than
 * read out of the source. This is what makes editing one visible: the Type and
 * Framework dropdowns ask here, so a framework renamed in the editor is
 * renamed everywhere it appears.
 *
 * Nothing stores a framework against a prompt. A section stores the id of a
 * framework component and the framework is derived from that, which is why a
 * rename reaches existing prompts without rewriting any of them. Do not
 * denormalise a framework name onto a component to save a lookup here.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from './ToastContext';
import { describeApiFailure } from '@/lib/apiClient';
import * as frameworksApi from '@/api/frameworksApi';
import {
  builtInTypeLabel,
  DEFAULT_FRAMEWORK_ID,
  FRAMEWORK_DEFINITIONS,
  SECTION_TYPE_LABELS,
} from '@/lib/sectionTypes';
import type { FrameworkPayload, FrameworkComponentPayload } from '@/types/contracts';

/**
 * What to show before the load finishes, built from the same definitions the
 * migration seeded, so the first paint matches what arrives and nothing jumps.
 */
const BUILT_IN_FALLBACK: FrameworkPayload[] = FRAMEWORK_DEFINITIONS.map(framework => ({
  id: framework.id,
  label: framework.label,
  description: '',
  components: framework.types.map(type => ({
    id: type,
    label: SECTION_TYPE_LABELS[type as keyof typeof SECTION_TYPE_LABELS] ?? type,
    description: '',
    example: '',
  })),
}));

type FrameworkContextType = {
  frameworks: FrameworkPayload[];
  isFrameworksLoading: boolean;
  /** One framework by id, falling back to the first so callers never hold null. */
  getFramework: (id: string) => FrameworkPayload;
  /** The first framework containing a type, which is how a section's framework is derived. */
  getFrameworkForType: (type: string | undefined) => FrameworkPayload;
  /** A component by id, wherever it lives, or null when nothing has that id. */
  getComponent: (type: string | undefined) => FrameworkComponentPayload | null;
  /** What to call a type: its component's label, else a built-in name, else the id. */
  typeLabel: (type: string | undefined) => string;
  /** A framework's default type: the component at the top of it. */
  defaultTypeFor: (frameworkId: string) => string;
  /** Creates or replaces a framework, then reloads. */
  saveFramework: (framework: FrameworkPayload) => Promise<boolean>;
  /** Removes a framework, then reloads. */
  deleteFramework: (id: string) => Promise<boolean>;
};

const FrameworkContext = createContext<FrameworkContextType | null>(null);

export const useFrameworkContext = (): FrameworkContextType => {
  const context = useContext(FrameworkContext);
  if (!context) {
    throw new Error('useFrameworkContext must be used within a FrameworkProvider');
  }
  return context;
};

export const FrameworkProvider = ({ children }: { children: ReactNode }) => {
  const [frameworks, setFrameworks] = useState<FrameworkPayload[]>(BUILT_IN_FALLBACK);
  const [isFrameworksLoading, setIsFrameworksLoading] = useState(true);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const loaded = await frameworksApi.fetchFrameworks();
      // An empty table would leave every dropdown blank; the built-ins are a
      // better answer than nothing while that is investigated.
      if (loaded.length > 0) setFrameworks(loaded);
    } catch (error) {
      console.error('Failed to load frameworks:', error);
      showToast(
        describeApiFailure(error, 'Could not load your frameworks; using the built-in set.')
      );
    } finally {
      setIsFrameworksLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Every component across every framework, by id. First claim wins. */
  const componentsById = useMemo(() => {
    const map = new Map<string, FrameworkComponentPayload>();
    frameworks.forEach(framework => {
      framework.components.forEach(component => {
        if (!map.has(component.id)) map.set(component.id, component);
      });
    });
    return map;
  }, [frameworks]);

  const getFramework = useCallback(
    (id: string): FrameworkPayload =>
      frameworks.find(framework => framework.id === id) ?? frameworks[0] ?? BUILT_IN_FALLBACK[0],
    [frameworks]
  );

  const getFrameworkForType = useCallback(
    (type: string | undefined): FrameworkPayload =>
      // First match, so a type in several frameworks resolves to the earliest —
      // the behaviour the static registry had, which is what keeps a prompt
      // stored before any of this reporting the framework it always did.
      frameworks.find(framework => framework.components.some(component => component.id === type)) ??
      frameworks[0] ??
      BUILT_IN_FALLBACK[0],
    [frameworks]
  );

  const getComponent = useCallback(
    (type: string | undefined): FrameworkComponentPayload | null =>
      type ? (componentsById.get(type) ?? null) : null,
    [componentsById]
  );

  const typeLabel = useCallback(
    (type: string | undefined): string => {
      if (!type) return '';
      // The stored frameworks first, so a relabelled component reads by its new
      // name. Then the built-in names, for a type no framework lists any more.
      // Then the id itself: showing the raw value of an orphaned type is more
      // honest than borrowing some other component's name for it.
      return componentsById.get(type)?.label ?? builtInTypeLabel(type) ?? type;
    },
    [componentsById]
  );

  const defaultTypeFor = useCallback(
    (frameworkId: string): string => {
      const framework = getFramework(frameworkId);
      return framework.components[0]?.id ?? '';
    },
    [getFramework]
  );

  const save = useCallback(
    async (framework: FrameworkPayload): Promise<boolean> => {
      try {
        await frameworksApi.saveFramework(framework);
        await load();
        return true;
      } catch (error) {
        console.error('Failed to save the framework:', error);
        showToast(describeApiFailure(error, 'Could not save the framework.'));
        return false;
      }
    },
    [load, showToast]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await frameworksApi.deleteFramework(id);
        await load();
        return true;
      } catch (error) {
        console.error('Failed to delete the framework:', error);
        showToast(describeApiFailure(error, 'Could not delete the framework.'));
        return false;
      }
    },
    [load, showToast]
  );

  return (
    <FrameworkContext.Provider
      value={{
        frameworks,
        isFrameworksLoading,
        getFramework,
        getFrameworkForType,
        getComponent,
        typeLabel,
        defaultTypeFor,
        saveFramework: save,
        deleteFramework: remove,
      }}
    >
      {children}
    </FrameworkContext.Provider>
  );
};

export { DEFAULT_FRAMEWORK_ID };
