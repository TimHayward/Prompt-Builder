/**
 * TreeContext
 * Manages the component and folder tree structure
 */

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from 'react';
import { TreeNode, FolderType, ComponentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from './AppContext';
import { useToast } from './ToastContext';
import { useSaveState } from './SaveStateContext';
import { apiRequest, apiSend, describeApiFailure } from '../lib/apiClient';
import type { SaveLibraryRequest } from '../types/contracts';
import { parseLoadedData } from '../utils/fileUtils';

import {
  insertNode,
  removeNode,
  isDescendant,
  moveNodeInTree,
  moveNodeUp,
  moveNodeDown,
  findNodeById as findNodeByIdUtil,
  updateNodeById,
  normalizeExpansionState,
} from '../utils/treeUtils';
import { debounce } from '../utils/debounce';

// Initial tree data - ID should be string
const INITIAL_TREE_DATA_ROOT_ID = uuidv4();
const INITIAL_TREE_DATA: FolderType[] = [
  {
    id: INITIAL_TREE_DATA_ROOT_ID,
    name: 'Components',
    type: 'folder',
    children: [],
    expanded: true,
  },
];

// Context type definition
type TreeContextType = {
  treeData: FolderType[];
  setTreeData: React.Dispatch<React.SetStateAction<FolderType[]>>;
  selectedNode: TreeNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<TreeNode | null>>;
  isComponentModalOpen: boolean;
  setComponentModalOpen: (open: boolean) => void;
  componentBeingEdited: ComponentType | null;
  setComponentBeingEdited: React.Dispatch<React.SetStateAction<ComponentType | null>>;
  handleAddFolder: (parentId: string, name: string) => void;
  handleAddComponent: (parentId: string, componentData: Omit<ComponentType, 'id' | 'type'>) => void;
  handleUpdateComponent: (component: ComponentType) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleNodeDrop: (draggedNodeId: string, targetNodeId: string) => void;
  handleMoveNodeUp: (nodeId: string) => void;
  handleMoveNodeDown: (nodeId: string) => void;
  isTreeLoading: boolean;
  handleToggleFolderExpand: (folderId: string) => void;
};

// No default value: the old one handed back an empty tree and silent no-ops,
// which looks like an empty library rather than a missing provider.
const TreeContext = createContext<TreeContextType | null>(null);

export const useTreeContext = (): TreeContextType => {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('useTreeContext must be used within a TreeProvider');
  }
  return context;
};

type TreeProviderProps = {
  children: ReactNode;
};

export const TreeProvider = ({ children }: TreeProviderProps) => {
  const [treeData, setTreeData] = useState<FolderType[]>(INITIAL_TREE_DATA);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [isComponentModalOpen, setComponentModalOpen] = useState(false);
  const [componentBeingEdited, setComponentBeingEdited] = useState<ComponentType | null>(null);
  const { appInitialized } = useAppContext();
  const { showToast } = useToast();
  const saveState = useSaveState();
  const [isTreeLoading, setIsTreeLoading] = useState<boolean>(true);

  // The debounced saver is built once, so it reaches the toast through a ref.
  const showToastRef = React.useRef(showToast);
  const saveStateRef = React.useRef(saveState);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const treeDataRef = React.useRef(treeData);
  useEffect(() => {
    treeDataRef.current = treeData;
  }, [treeData]);

  // Items the user actually deleted, held until a save reports them to the API.
  // The server removes only these, so items added by another path since this
  // client loaded survive a save that does not know about them.
  const pendingDeletedIdsRef = React.useRef<Set<string>>(new Set());

  const isEffectivelyInitialOrEmpty = useCallback(
    (data: FolderType[] | null | undefined): boolean => {
      if (!data || data.length === 0) {
        return true;
      }
      if (
        data.length === 1 &&
        data[0].id === INITIAL_TREE_DATA_ROOT_ID &&
        data[0].name === 'Components' &&
        data[0].type === 'folder' &&
        (!data[0].children || data[0].children.length === 0)
      ) {
        return true;
      }
      return false;
    },
    []
  );

  const fetchAndParseStarterKit = useCallback(async (): Promise<FolderType[] | null> => {
    try {
      const response = await fetch('/starter-kit.json');
      if (!response.ok) {
        console.error('Failed to fetch starter-kit.json:', response.statusText);
        return null;
      }
      const jsonData = await response.json();
      const { tree } = parseLoadedData(jsonData);
      return tree as FolderType[];
    } catch (error) {
      console.error('Error fetching or parsing starter-kit.json:', error);
      return null;
    }
  }, []);
  // Function to transform flat list from API to tree structure
  // This assumes the API returns a flat list with parent_id references.
  // If the API returns a nested structure, this will need to be adjusted.
  const buildTreeFromApiData = useCallback(
    (
      apiItems: (
        | (Omit<ComponentType, 'type'> & {
            item_type: 'component';
            parent_id: string | null;
            component_type: ComponentType['componentType'];
          })
        | (Omit<FolderType, 'type' | 'children' | 'expanded'> & {
            item_type: 'folder';
            parent_id: string | null;
            is_expanded?: boolean;
          })
      )[]
    ): FolderType[] => {
      // First, check if we have a root "Components" folder in the API data
      const rootFolderFromApi = apiItems.find(
        item => item.item_type === 'folder' && item.name === 'Components' && item.parent_id === null
      );

      // Create a map for quick lookup of items by ID
      const itemMap: {
        [id: string]: TreeNode & {
          children?: TreeNode[];
          parent_id?: string | null;
          is_expanded?: boolean;
        };
      } = {};

      // Define the final root folder that we'll return
      // Use the ID from API if it exists, otherwise use our constant ID
      // SQLite stores the flag as 0/1, so accept either that or a boolean.
      const toExpanded = (value: unknown, fallback: boolean): boolean =>
        value === undefined || value === null ? fallback : value === 1 || value === true;

      const rootFolder: FolderType = {
        id: rootFolderFromApi ? rootFolderFromApi.id : INITIAL_TREE_DATA_ROOT_ID,
        name: 'Components',
        type: 'folder',
        children: [],
        expanded: rootFolderFromApi
          ? toExpanded((rootFolderFromApi as any).is_expanded, true)
          : true,
      };

      // Add the root folder to our map
      itemMap[rootFolder.id] = rootFolder;

      // Process all items from the API
      apiItems.forEach(item => {
        // Skip the root folder as we already processed it
        if (item.id === rootFolder.id) {
          return;
        }

        let treeNode:
          | (ComponentType & { parent_id?: string | null })
          | (FolderType & { parent_id?: string | null });

        if (item.item_type === 'folder') {
          treeNode = {
            id: item.id,
            name: item.name,
            type: 'folder',
            children: [],
            expanded: toExpanded(item.is_expanded, false),
            parent_id: item.parent_id,
          };
        } else {
          // component
          treeNode = {
            id: item.id,
            name: item.name,
            type: 'component',
            content: (item as any).content, // Cast needed due to Omit
            componentType: item.component_type,
            parent_id: item.parent_id,
          };
        }
        itemMap[treeNode.id] = treeNode;
      }); // Build the tree structure by connecting children to their parents
      Object.values(itemMap).forEach(item => {
        if (item.id === rootFolder.id) return; // Skip the root folder

        if (item.parent_id && itemMap[item.parent_id]) {
          const parentFolder = itemMap[item.parent_id] as FolderType;
          if (parentFolder.type === 'folder') {
            parentFolder.children.push(item as TreeNode);
          }
        } else if (item.parent_id === null || !itemMap[item.parent_id!]) {
          // Items without a parent_id or with an invalid parent_id become direct children of the root folder
          rootFolder.children.push(item as TreeNode);
        }
      });

      // Return the single root folder as our tree
      return [rootFolder];
    },
    [INITIAL_TREE_DATA_ROOT_ID]
  );

  // Debounced function to save the tree to the API. The payload is the whole
  // tree plus the deletions this client made; the API upserts the tree and
  // removes only the listed items.
  const saveTreeToApi = useCallback(
    debounce(async (currentTreeData: FolderType[]) => {
      const deletedIds = Array.from(pendingDeletedIdsRef.current);
      saveStateRef.current.markSaving('library');
      try {
        // Typed as the API's contract so the payload cannot drift from what the
        // route accepts.
        const save: SaveLibraryRequest = { tree: currentTreeData, deletedIds };
        await apiSend('/api/components', 'POST', save);
        // Only clear what this request carried; anything deleted meanwhile stays queued.
        deletedIds.forEach(id => pendingDeletedIdsRef.current.delete(id));
        saveStateRef.current.markSaved('library');
      } catch (error) {
        // The deletions stay pending so the next save retries them.
        saveStateRef.current.markFailed('library');
        console.error('[TreeContext] Failed to save the component library:', error);
        showToastRef.current(describeApiFailure(error, 'Could not save the component library.'));
      }
    }, 2500),
    []
  );

  useEffect(() => {
    const loadInitialTreeData = async () => {
      if (!appInitialized) {
        setIsTreeLoading(false);
        return;
      }
      setIsTreeLoading(true);

      try {
        // The row shape is whatever buildTreeFromApiData accepts, so the two
        // cannot drift apart.
        type ApiLibraryItem = Parameters<typeof buildTreeFromApiData>[0][number];
        let apiItemsFlat: ApiLibraryItem[] | null = null;
        try {
          apiItemsFlat = await apiRequest<ApiLibraryItem[]>('/api/components'); // Expecting flat list from API
        } catch (error) {
          console.error('[TreeContext] Error fetching the component library:', error);
          showToast(describeApiFailure(error, 'Could not load the component library.'));
        }

        if (apiItemsFlat) {
          if (Array.isArray(apiItemsFlat) && apiItemsFlat.length > 0) {
            const structuredTree = buildTreeFromApiData(apiItemsFlat);
            const normalizedTree = normalizeExpansionState(structuredTree, true) as FolderType[]; // Root is expanded
            setTreeData(normalizedTree);
          } else {
            // API returned empty or invalid data, try starter kit
            const starterKitTree = await fetchAndParseStarterKit();
            if (starterKitTree) {
              // Starter kit is already FolderType[] and should have expansion state
              const normalizedStarterKit = normalizeExpansionState(
                starterKitTree,
                true
              ) as FolderType[];
              setTreeData(normalizedStarterKit);
              saveTreeToApi(normalizedStarterKit);
            } else {
              setTreeData(INITIAL_TREE_DATA);
            }
          }
        } else {
          // The fetch failed and was reported above; fall back to the starter kit
          // rather than showing an empty sidebar.
          const starterKitTree = await fetchAndParseStarterKit();
          if (starterKitTree) {
            const normalizedStarterKit = normalizeExpansionState(
              starterKitTree,
              true
            ) as FolderType[];
            setTreeData(normalizedStarterKit);
          } else {
            setTreeData(INITIAL_TREE_DATA);
          }
        }
      } catch (e) {
        console.error('[TreeContext|useEffect] General error during initial tree load:', e);
        try {
          const starterKitTree = await fetchAndParseStarterKit();
          if (starterKitTree) {
            const normalizedStarterKit = normalizeExpansionState(
              starterKitTree,
              true
            ) as FolderType[];
            setTreeData(normalizedStarterKit);
          } else {
            setTreeData(INITIAL_TREE_DATA);
          }
        } catch (starterKitError) {
          console.error('Error loading starter kit as fallback:', starterKitError);
          setTreeData(INITIAL_TREE_DATA);
        }
      } finally {
        setIsTreeLoading(false);
      }
    };

    loadInitialTreeData();
  }, [
    appInitialized,
    fetchAndParseStarterKit,
    saveTreeToApi,
    normalizeExpansionState,
    buildTreeFromApiData,
    INITIAL_TREE_DATA_ROOT_ID,
    showToast,
  ]);

  // Effect to save tree data to API when it changes
  useEffect(() => {
    // Only save if not loading, app is initialized, and treeData is not the initial empty state.
    // The check for INITIAL_TREE_DATA might be too simplistic if user intentionally clears to this state.
    // However, saveTreeToApi will be called after load if starter kit is used.
    if (!isTreeLoading && appInitialized && treeData !== INITIAL_TREE_DATA) {
      // Check if treeData is not the default initial one to avoid saving it on first load if API was empty
      // This condition needs to be robust. Comparing arrays/objects directly is tricky.
      // A better check might be if the treeData reference is different from the initial constant
      // or if it has more than the initial root folder with no children.
      if (!isEffectivelyInitialOrEmpty(treeData)) {
        // Reported through the ref, and saveState is deliberately not a
        // dependency: marking the library unsaved changes the save state,
        // which would re-run this effect, which would mark it unsaved again.
        // That loop saved the library every few seconds forever and left the
        // indicator permanently reading "Unsaved changes".
        saveStateRef.current.markUnsaved('library');
        saveTreeToApi(treeData);
      }
    }
  }, [treeData, appInitialized, isTreeLoading, saveTreeToApi, isEffectivelyInitialOrEmpty]);

  const handleAddFolder = (parentId: string, name: string) => {
    const newFolderId = uuidv4();
    const newFolder: FolderType = {
      id: newFolderId,
      name,
      type: 'folder',
      children: [],
      expanded: false,
    };
    // Optimistic update
    const newTreeData = insertNode(treeDataRef.current, parentId, newFolder);
    setTreeData(newTreeData);
    setSelectedNode(newFolder);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleAddComponent = (
    parentId: string,
    componentData: Omit<ComponentType, 'id' | 'type'>
  ) => {
    const newComponent: ComponentType = {
      ...componentData,
      id: uuidv4(),
      type: 'component',
    };
    // Optimistic update
    const newTreeData = insertNode(treeDataRef.current, parentId, newComponent);
    setTreeData(newTreeData);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleUpdateComponent = (componentToUpdate: ComponentType) => {
    // Optimistic update
    const updateInTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === componentToUpdate.id && node.type === 'component') {
          return componentToUpdate;
        }
        if (node.type === 'folder') {
          return { ...node, children: updateInTree(node.children) };
        }
        return node;
      });
    };
    setTreeData(prevTree => updateInTree(prevTree) as FolderType[]);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleDeleteNode = (nodeId: string) => {
    // Recorded so the save tells the API this item was removed on purpose;
    // the API deletes its descendants with it.
    pendingDeletedIdsRef.current.add(nodeId);

    // Optimistic update
    const newTreeData = removeNode(treeDataRef.current, nodeId);
    setTreeData(newTreeData);

    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode(null);
    }
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleMoveNodeUp = (nodeId: string) => {
    const newTreeData = moveNodeUp(treeDataRef.current, nodeId);
    setTreeData(newTreeData);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleMoveNodeDown = (nodeId: string) => {
    const newTreeData = moveNodeDown(treeDataRef.current, nodeId);
    setTreeData(newTreeData);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleNodeDrop = (draggedNodeId: string, targetNodeId: string) => {
    const currentTree = treeDataRef.current;
    const draggedNode = findNodeByIdUtil(currentTree, draggedNodeId);
    const targetNode = findNodeByIdUtil(currentTree, targetNodeId);

    if (!draggedNode || !targetNode) return;

    const actualTargetFolderId = targetNodeId;
    if (targetNode.type !== 'folder') {
      // This logic needs to find the parent of targetNode if it's a component.
      // For now, we assume targetNodeId is a folder or we need a findParent function.
      // Let's simplify: if target is not a folder, disallow or find parent.
      // This is complex. Let's assume targetNodeId is always a valid folder drop target for now.
      console.warn('Complex drop target, assuming targetNodeId is a folder.');
      // A better approach: moveNodeInTree should take the target *parent* ID.
      // If targetNode is a component, the drop should be on its parent.
      // This requires findParent(targetNodeId) or similar.
    }

    if (
      draggedNode.type === 'folder' &&
      isDescendant(targetNode as FolderType, draggedNode as FolderType)
    ) {
      console.warn('Cannot drop a folder into its own descendant.');
      return;
    }

    // Optimistic update
    const newTreeData = moveNodeInTree(currentTree, draggedNodeId, actualTargetFolderId);
    setTreeData(newTreeData);
    // saveTreeToApi will be called by the useEffect watching treeData
  };

  const handleToggleFolderExpand = (folderId: string) => {
    const currentTree = treeDataRef.current;
    const nodeToUpdate = findNodeByIdUtil(currentTree, folderId);
    if (nodeToUpdate && nodeToUpdate.type === 'folder') {
      const currentFolder = nodeToUpdate as FolderType;
      const updates: Partial<FolderType> = { expanded: !currentFolder.expanded };
      const newTreeData = updateNodeById(currentTree, folderId, updates);
      setTreeData(newTreeData);
      // saveTreeToApi will be called by the useEffect watching treeData
    }
  };

  return (
    <TreeContext.Provider
      value={{
        treeData,
        setTreeData,
        selectedNode,
        setSelectedNode,
        isComponentModalOpen,
        setComponentModalOpen,
        componentBeingEdited,
        setComponentBeingEdited,
        handleAddFolder,
        handleAddComponent,
        handleUpdateComponent,
        handleDeleteNode,
        handleNodeDrop,
        handleMoveNodeUp,
        handleMoveNodeDown,
        isTreeLoading,
        handleToggleFolderExpand,
      }}
    >
      {children}
    </TreeContext.Provider>
  );
};
