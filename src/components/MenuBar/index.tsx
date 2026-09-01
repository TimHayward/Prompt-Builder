/**
 * MenuBar component
 * Provides a vertical bar with icon buttons for various actions.
 */
import React from 'react';
import './MenuBar.scss';

import SettingsIcon from "@mui/icons-material/Settings";
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';

interface MenuBarProps {
  openSettings: () => void;
}

const MenuBar: React.FC<MenuBarProps> = ({ openSettings }) => {

  return (
    <div id="menu-bar">
      <a
        href="https://github.com/TimHayward/Prompt-Builder"
        target="_blank"
        rel="noopener noreferrer"
        className="menu-button"
        title="Documentation"
      >
        <ArticleOutlinedIcon fontSize="inherit" />
      </a>

      {/* Profile Button and Menu */}
      <div className="profile-section">
        <button className="menu-button" title="Settings" onClick={openSettings}>
            <SettingsIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
};

export default MenuBar;
