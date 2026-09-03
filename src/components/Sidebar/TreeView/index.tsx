'use client';

/**
 * TreeView component
 * Displays the folder/component hierarchy
 */

import React from 'react';
import { FolderType, TreeNode } from '@/types';
import TreeNodeComponent from './TreeNode'; // Corrected import path

interface TreeViewProps {
  treeData: FolderType[];
  selectedNode: TreeNode | null;
  setSelectedNode: (node: TreeNode) => void;
  isAddingFolder: string | null;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  // Use a more accurate type that matches what useRef returns
  newFolderInputRef: React.RefObject<HTMLInputElement>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  submitNewFolder: () => void;
  startAddFolder: (folderId: string) => void;
  openAddComponentModal: (folderId: string) => void;
  openEditComponentModal: (component: TreeNode) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleToggleFolderExpand: (folderId: string) => void;
  handleMoveNodeUp: (nodeId: string) => void;
  handleMoveNodeDown: (nodeId: string) => void;
}

const TreeView: React.FC<TreeViewProps> = ({
  treeData,
  selectedNode,
  setSelectedNode,
  isAddingFolder,
  newFolderName,
  setNewFolderName,
  newFolderInputRef,
  handleKeyDown,
  submitNewFolder,
  startAddFolder,
  openAddComponentModal,
  openEditComponentModal,
  handleDeleteNode,
  handleToggleFolderExpand,
  handleMoveNodeUp,
  handleMoveNodeDown,
}) => {
  return (
    <div className="tree-view">
      {treeData.map(node => (
        <TreeNodeComponent
          key={node.id} // id is already string from FolderType
          node={node}
          level={0}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          isAddingFolder={isAddingFolder} // Propagating string | null
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          newFolderInputRef={newFolderInputRef}
          handleKeyDown={handleKeyDown}
          submitNewFolder={submitNewFolder}
          startAddFolder={startAddFolder} // Propagating (folderId: string) => void
          openAddComponentModal={openAddComponentModal} // Propagating (folderId: string) => void
          openEditComponentModal={openEditComponentModal}
          handleDeleteNode={handleDeleteNode} // Propagating (nodeId: string) => void
          handleToggleFolderExpand={handleToggleFolderExpand}
          handleMoveNodeUp={handleMoveNodeUp}
          handleMoveNodeDown={handleMoveNodeDown}
        />
      ))}
    </div>
  );
};

export default TreeView;
