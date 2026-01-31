/**
 * Variable Utilities
 * Functions for extracting and managing prompt variables ({{variable}})
 */

/**
 * Extracts all variables from a text string
 * Variables are identified by {{variableName}} pattern
 * @param text - The text to extract variables from
 * @returns An array of unique variable names (without the braces)
 */
export const extractVariables = (text: string): string[] => {
  if (!text) return [];
  
  // Match all {{variable}} patterns
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = text.matchAll(regex);
  const variables: string[] = [];
  
  for (const match of matches) {
    const variableName = match[1].trim();
    // Only add if not already in the list
    if (variableName && !variables.includes(variableName)) {
      variables.push(variableName);
    }
  }
  
  return variables;
};

/**
 * Extracts variables from multiple sections
 * @param sections - Array of section objects with content property
 * @returns An array of unique variable names across all sections
 */
export const extractVariablesFromSections = (
  sections: Array<{ content: string }> | undefined
): string[] => {
  if (!sections || sections.length === 0) return [];
  
  const allVariables: string[] = [];
  
  sections.forEach(section => {
    const sectionVariables = extractVariables(section.content);
    sectionVariables.forEach(variable => {
      if (!allVariables.includes(variable)) {
        allVariables.push(variable);
      }
    });
  });
  
  return allVariables;
};

/**
 * Replaces variable values in text
 * @param text - The text containing variables
 * @param variables - Object mapping variable names to their values
 * @returns Text with variables replaced with their values
 */
export const replaceVariables = (
  text: string,
  variables: Record<string, string>
): string => {
  let result = text;
  
  Object.entries(variables).forEach(([variableName, value]) => {
    const regex = new RegExp(`\\{\\{${variableName}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  });
  
  return result;
};
