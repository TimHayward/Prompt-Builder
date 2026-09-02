/**
 * AppContext
 * Manages global application state and settings
 */

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Settings } from "@/types";
import { useToast } from "./ToastContext";
import { apiRequest, apiSend, describeApiFailure } from "@/lib/apiClient";

const LOCAL_STORAGE_SETTINGS_KEY = 'promptBuilderSettings'; // May still be used for temporary or non-critical settings

// Default settings
const DEFAULT_SETTINGS: Settings = {
  autoSave: true,
  defaultPromptName: "New Prompt",
  defaultSectionType: "instruction",
  theme: "dark",
  markdownPromptingEnabled: false,
  systemPrompt: "# Prompt Structure/System Guide\n\nThis document outlines a structured request format for the following prompt. Each section of the prompt is clearly marked with a markdown heading that indicates both the section type and title.\n\n## Section Types\n\n### **Role** \nDefines the expertise, perspective, or character you will adopt. You will embody this role completely while processing and responding to the prompt.\n\n### **Context** \nProvides essential background information and situational details needed for you to understand the task. All context is critical for generating an appropriate response.\n\n### **Instructions** \nSpecifies the exact deliverables and actions required. This section defines success criteria and should be followed precisely.\n\n### **Style** \nEstablishes guidelines for your style in formulating a response. Your response should consistently adhere to these stylistic guidelines.\n\n### **Format** \nDetails the structural requirements for the output, including organization, layout, and presentation specifications.\n\n## Implementation\n\n- Each section begins with a level-1 markdown heading: `# [Type]: [Title]`\n- You will thoroughly process all sections before producing a response\n- You must prioritize following instructions precisely while maintaining the specified role, context awareness, style, and format\n\nWhat follows is the prompt using the outlined system and formatting.",
};

// Context type definition
type AppContextType = {
  appName: string;
  appVersion: string;
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isSettingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  isCommunityModalOpen: boolean;
  setCommunityModalOpen: (open: boolean) => void;
  importPromptPayload: { filename: string; content: string } | null;
  setImportPromptPayload: (payload: { filename: string; content: string } | null) => void;
  appInitialized: boolean;
};

// Create context with default values
const AppContext = createContext<AppContextType>({
  appName: "Prompt Builder",
  appVersion: "1.0.0",
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  isSettingsModalOpen: false,
  setSettingsModalOpen: () => {},
  isCommunityModalOpen: false,
  setCommunityModalOpen: () => {},
  importPromptPayload: null,
  setImportPromptPayload: () => {},
  appInitialized: false,
});

// Hook for using this context
export const useAppContext = () => useContext(AppContext);

// Provider component
type AppProviderProps = {
  children: ReactNode;
};

export const AppProvider = ({ children }: AppProviderProps) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isCommunityModalOpen, setCommunityModalOpen] = useState(false);
  const [importPromptPayload, setImportPromptPayload] = useState<{ filename: string; content: string } | null>(null);
  const [appInitialized, setAppInitialized] = useState(false);
  const { showToast } = useToast();

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      setAppInitialized(false);
      try {
        const data = await apiRequest<{ settings?: Settings }>('/api/settings');

        if (data.settings) {
          setSettings(data.settings);
        } else {
          // No settings stored yet: fall back to defaults and record them.
          setSettings(DEFAULT_SETTINGS);
          await apiSend('/api/settings', 'POST', {
            settings: DEFAULT_SETTINGS,
            activePromptId: null,
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        setSettings(DEFAULT_SETTINGS); // Fallback to defaults on any error
        showToast(describeApiFailure(error, 'Could not load your settings; using defaults.'));
      }
      setAppInitialized(true);
    };

    loadSettings();
  }, [showToast]); // Run once on mount

  // Save settings when they change
  useEffect(() => {
    if (!appInitialized) return; // Don't save during initial load or if not initialized

    const saveSettings = async () => {
      try {
        await apiSend('/api/settings', 'POST', { settings });
      } catch (error) {
        // Whether the server rejected the payload or was unreachable, the
        // settings are kept locally so the user's choices survive, and the
        // failure is shown rather than left in the console.
        console.error('Failed to save settings:', error);
        try {
          localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
          console.warn('Failed to persist settings to localStorage:', e);
        }
        showToast(describeApiFailure(error, 'Could not save your settings.'));
      }
    };

    // Debounce saving to avoid rapid writes
    const debounceSave = setTimeout(saveSettings, 1000);
    return () => clearTimeout(debounceSave);

  }, [settings, appInitialized, showToast]);

  // Function to update settings
  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prevSettings) => ({
      ...prevSettings,
      ...newSettings,
    }));
  };

  return (
    <AppContext.Provider
      value={{
        appName: "Prompt Builder",
        appVersion: "1.0.0",
        settings,
        updateSettings,
        isSettingsModalOpen,
        setSettingsModalOpen,
        isCommunityModalOpen,
        setCommunityModalOpen,
        importPromptPayload,
        setImportPromptPayload,
        appInitialized,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};