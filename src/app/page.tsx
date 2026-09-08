'use client'; // Mark as a Client Component

/**
 * App component
 * Main application entry point that orchestrates contexts and components
 */

import React, { useEffect } from 'react';
import { AppProvider, useAppContext } from '@/contexts/AppContext';
import { TreeProvider, useTreeContext } from '@/contexts/TreeContext';
import { PromptProvider } from '@/contexts/PromptContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SaveStateProvider } from '@/contexts/SaveStateContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { FrameworkProvider } from '@/contexts/FrameworkContext';
import Sidebar from '@/components/Sidebar';
import PromptEditor from '@/components/PromptEditor';
import VariablesPane from '@/components/VariablesPane';
import PaneDivider from '@/components/PaneDivider';
import { usePaneLayout } from '@/hooks/usePaneLayout';
import { maxPaneWidth, renderedWidth } from '@/domain/paneLayout';
import ComponentModal from '@/components/Modal/ComponentModal';
import SettingsModal from '@/components/Modal/SettingsModal';
import ImportPromptModal from '@/components/Modal/ImportPromptModal';
import MenuBar from '@/components/MenuBar';
import './App.scss';

// Inner App component that uses the contexts
const AppContent: React.FC = () => {
  const { settings, setSettingsModalOpen } = useAppContext();
  const { handleNodeDrop } = useTreeContext();
  const { layout, viewport, hydrated, setPaneWidth, togglePane, resetPane } = usePaneLayout();
  // Derived from the hook's viewport state, never from window during render.
  const paneMax = maxPaneWidth(viewport);

  // Set up event listeners for drag and drop operations between tree and sections
  useEffect(() => {
    const handleNodeDropped = (e: CustomEvent) => {
      if (e.detail && e.detail.draggedNodeId && e.detail.targetNodeId) {
        handleNodeDrop(e.detail.draggedNodeId, e.detail.targetNodeId);
      }
    };

    // Listen for custom node-dropped event
    window.addEventListener('node-dropped' as any, handleNodeDropped as EventListener);

    return () => {
      window.removeEventListener('node-dropped' as any, handleNodeDropped as EventListener);
    };
  }, [handleNodeDrop]);

  // Apply theme from settings
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  return (
    <main
      // The panes read their own width from these, so neither component needs
      // to know it is resizable. Same idiom as --section-color in Section.
      //
      // Nothing is published until the stored layout has been read: the
      // properties are absent for the first paint, so the stylesheet's own
      // 25vw/35vw fallbacks govern it. Publishing a width guessed without a
      // window to measure would show it and then correct it.
      style={
        hydrated
          ? ({
              '--sidebar-width': `${renderedWidth(layout, 'sidebar')}px`,
              '--variables-width': `${renderedWidth(layout, 'variables')}px`,
            } as React.CSSProperties)
          : undefined
      }
      data-sidebar-collapsed={layout.sidebarCollapsed}
      data-variables-collapsed={layout.variablesCollapsed}
    >
      <Sidebar />
      <PaneDivider
        side="sidebar"
        label="Library"
        width={layout.sidebar}
        max={paneMax}
        collapsed={layout.sidebarCollapsed}
        onResize={width => setPaneWidth('sidebar', width)}
        onToggle={() => togglePane('sidebar')}
        onReset={() => resetPane('sidebar')}
      />
      <PromptEditor />
      <PaneDivider
        side="variables"
        label="Variables"
        width={layout.variables}
        max={paneMax}
        collapsed={layout.variablesCollapsed}
        onResize={width => setPaneWidth('variables', width)}
        onToggle={() => togglePane('variables')}
        onReset={() => resetPane('variables')}
      />
      <VariablesPane />
      <MenuBar openSettings={() => setSettingsModalOpen(true)} />
      <ComponentModal />
      <SettingsModal />
      <ImportPromptModal />
    </main>
  );
};

// Root App component with context providers.
// ToastProvider is outermost so the data contexts can report failed saves.
const App: React.FC = () => {
  return (
    <ToastProvider>
      <SaveStateProvider>
        <AppProvider>
          {/* Above TreeProvider and PromptProvider: the editor reads both to
              decide whether removing a component would orphan anything, and
              the type dropdowns read the frameworks. */}
          <FrameworkProvider>
            <TreeProvider>
              <PromptProvider>
                <WorkspaceProvider>
                  <AppContent />
                </WorkspaceProvider>
              </PromptProvider>
            </TreeProvider>
          </FrameworkProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );
};

export default App;
