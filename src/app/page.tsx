"use client"; // Mark as a Client Component

/**
 * App component
 * Main application entry point that orchestrates contexts and components
 */

import React, { useEffect } from "react";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { TreeProvider, useTreeContext } from "@/contexts/TreeContext";
import { PromptProvider } from "@/contexts/PromptContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { SaveStateProvider } from "@/contexts/SaveStateContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import Sidebar from "@/components/Sidebar";
import PromptEditor from "@/components/PromptEditor";
import VariablesPane from "@/components/VariablesPane";
import ComponentModal from "@/components/Modal/ComponentModal";
import SettingsModal from "@/components/Modal/SettingsModal";
import ImportPromptModal from "@/components/Modal/ImportPromptModal";
import MenuBar from '@/components/MenuBar'; 
import "./App.scss";

// Inner App component that uses the contexts
const AppContent: React.FC = () => {
  const { settings, setSettingsModalOpen } = useAppContext();
  const { handleNodeDrop } = useTreeContext();

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
    <main>
      <Sidebar />
      <PromptEditor />
      <VariablesPane />
      <MenuBar 
        openSettings={() => setSettingsModalOpen(true)} 
      />
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
          <TreeProvider>
            <PromptProvider>
              <WorkspaceProvider>
                <AppContent />
              </WorkspaceProvider>
            </PromptProvider>
          </TreeProvider>
        </AppProvider>
      </SaveStateProvider>
    </ToastProvider>
  );
};

export default App;