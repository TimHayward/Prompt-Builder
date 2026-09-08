/**
 * API contracts
 *
 * One definition per payload, shared by the routes that validate incoming data
 * and the client code that sends it. The TypeScript types are inferred from the
 * schemas, so a contract cannot drift from its validation.
 *
 * Runtime validation matters here because `body as Partial<Prompt>` is a
 * compile-time fiction: the request body is whatever the caller sent.
 */

import { z } from 'zod';
import type { ComponentType, FolderType } from '@/types';

/**
 * A section's type: the id of a framework component.
 *
 * Any non-empty string, not a closed list. Frameworks are editable data now
 * (migration 9), so the set of valid types is a table someone can add to — an
 * enum built at module load could only ever describe the five frameworks that
 * shipped, and would refuse to save a section using a component the user had
 * just created.
 *
 * This is a real loss of a guarantee, and worth being explicit about: a typo or
 * a stale id can now be persisted where before it could not. What makes it
 * acceptable is that nothing branches on a type value — there is no switch over
 * them anywhere — and getTypeMeta already answers for an unknown type with the
 * default label and colour. An unrecognised type degrades to a plain-looking
 * section rather than breaking the prompt that holds it.
 */
export const sectionTypeSchema = z.string().min(1);

/**
 * A section as stored. Editor state — open, dirty, the header-rename fields —
 * is deliberately absent: zod strips unknown keys, so a client that sends it
 * cannot get it written to the prompt.
 */
export const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  content: z.string(),
  type: sectionTypeSchema,
  linkedComponentId: z.string().optional(),
  linked: z.boolean().optional(),
  originalContent: z.string().optional(),
});

/** Variable values are a flat name → value map. */
export const variablesSchema = z.record(z.string(), z.string());

export const promptSchema = z.object({
  id: z.string().min(1),
  num: z.number().nullable(),
  name: z.string().min(1),
  description: z.string(),
  isFavourite: z.boolean(),
  tags: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  sections: z.array(sectionSchema),
  variables: variablesSchema.optional(),
});

export const createPromptRequestSchema = z.object({
  // The message covers both a missing name and an empty one, so the UI shows
  // something readable rather than "expected string, received undefined".
  name: z.string({ error: 'Prompt name is required' }).min(1, 'Prompt name is required'),
  description: z.string().optional(),
  isFavourite: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  sections: z.array(sectionSchema).optional(),
  variables: variablesSchema.optional(),
  num: z.number().nullable().optional(),
});

/** Every field is optional, but a request that changes nothing is rejected. */
export const updatePromptRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    isFavourite: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    lastUsedAt: z.string().nullable().optional(),
    sections: z.array(sectionSchema).optional(),
    variables: variablesSchema.optional(),
    num: z.number().nullable().optional(),
  })
  .refine(
    body =>
      [
        'name',
        'description',
        'isFavourite',
        'tags',
        'lastUsedAt',
        'sections',
        'variables',
        'num',
      ].some(field => field in body),
    {
      message: 'No fields to update provided',
    }
  );

export const ingestPromptRequestSchema = z.object({
  filename: z.string().trim().min(1, 'Filename is required'),
  content: z.string().trim().min(1, 'Content is required'),
});

/**
 * The component library tree, as the sidebar holds it. Typed as the app's own
 * ComponentType and FolderType so the contract cannot drift from the model the
 * UI works with.
 */
export const componentNodeSchema: z.ZodType<ComponentType> = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.literal('component'),
  content: z.string(),
  componentType: sectionTypeSchema,
});

export const folderNodeSchema: z.ZodType<FolderType> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string(),
    type: z.literal('folder'),
    expanded: z.boolean(),
    children: z.array(z.union([folderNodeSchema, componentNodeSchema])),
  })
);

/**
 * The library save. `deletedIds` names what the client removed on purpose;
 * anything simply absent from `tree` is left alone, which is what stops a stale
 * snapshot from wiping items added by another path.
 */
export const saveLibraryRequestSchema = z.object({
  tree: z.array(folderNodeSchema),
  deletedIds: z.array(z.string().min(1)).default([]),
});

/**
 * A framework component.
 *
 * The id is what a section's `type` stores, so a client editing a framework
 * must send back the ids it was given — inventing a new one for an existing
 * component renames the immutable half and orphans every section using it.
 */
export const frameworkComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, 'A component needs a name'),
  description: z.string(),
  example: z.string(),
});

/** A framework, with its components in the order they are read. */
export const frameworkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, 'A framework needs a name'),
  description: z.string(),
  components: z.array(frameworkComponentSchema),
});

/**
 * Working state for one prompt: the values entered for this use, and any
 * temporary section edits. Separate from the prompt itself, so using a prompt
 * never rewrites it.
 */
export const workspaceSchema = z.object({
  promptId: z.string().min(1),
  values: variablesSchema,
  sectionOverrides: z.record(z.string(), z.string()),
});

export const updateWorkspaceRequestSchema = z.object({
  values: variablesSchema.optional(),
  sectionOverrides: z.record(z.string(), z.string()).optional(),
});

export const settingsSchema = z.object({
  autoSave: z.boolean(),
  defaultPromptName: z.string(),
  defaultSectionType: sectionTypeSchema,
  theme: z.enum(['dark', 'light']),
  markdownPromptingEnabled: z.boolean(),
  systemPrompt: z.string(),
});

/** Any part may be sent on its own; the route merges with what is stored. */
export const updateSettingsRequestSchema = z
  .object({
    settings: settingsSchema.optional(),
    activePromptId: z.string().nullable().optional(),
    /** The prompts open as tabs, in tab order. */
    openPromptIds: z.array(z.string().min(1)).optional(),
  })
  .refine(body => 'settings' in body || 'activePromptId' in body || 'openPromptIds' in body, {
    message: 'Settings, activePromptId or openPromptIds must be provided',
  });

export type PromptWorkspace = z.infer<typeof workspaceSchema>;
export type FrameworkComponentPayload = z.infer<typeof frameworkComponentSchema>;
export type FrameworkPayload = z.infer<typeof frameworkSchema>;
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequestSchema>;
export type CreatePromptRequest = z.infer<typeof createPromptRequestSchema>;
export type UpdatePromptRequest = z.infer<typeof updatePromptRequestSchema>;
export type IngestPromptRequest = z.infer<typeof ingestPromptRequestSchema>;
export type SaveLibraryRequest = z.infer<typeof saveLibraryRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
export type PromptResponse = z.infer<typeof promptSchema>;
export type SettingsResponse = {
  settings: z.infer<typeof settingsSchema>;
  activePromptId: string | null;
  openPromptIds: string[];
};

/** The shape every failing route returns. */
export type ErrorResponse = {
  error: string;
  /** Field-level detail for a validation failure. */
  details?: { path: string; message: string }[];
};
