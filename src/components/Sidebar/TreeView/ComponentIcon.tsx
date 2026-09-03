/**
 * ComponentIcon component
 * Renders the appropriate icon based on component type with the correct styling
 */

import React from 'react';
import { getTypeMeta, SectionTypeValue } from '@/lib/frameworks';

interface ComponentIconProps {
  componentType: SectionTypeValue;
}

const ComponentIcon: React.FC<ComponentIconProps> = ({ componentType }) => {
  const { icon: Icon, color } = getTypeMeta(componentType);
  return <Icon fontSize="small" style={{ color }} />;
};

export default ComponentIcon;
