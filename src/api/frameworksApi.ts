/**
 * Frameworks API client
 *
 * The browser's half of the framework endpoints. Callers work in frameworks and
 * never assemble a request.
 */

import { apiRequest, apiSend } from '@/lib/apiClient';
import type { FrameworkPayload } from '@/types/contracts';

/** Every framework, each with its components in the order they are read. */
export const fetchFrameworks = (): Promise<FrameworkPayload[]> =>
  apiRequest<FrameworkPayload[]>('/api/frameworks');

/**
 * Creates or replaces one framework.
 *
 * The component list is authoritative: the order sent becomes the stored order,
 * and a component left out of it is removed. Send back the ids you were given —
 * a component's id is what prompts store, so inventing a new one for an
 * existing component renames the half that must not move.
 */
export const saveFramework = (framework: FrameworkPayload): Promise<FrameworkPayload> =>
  apiSend<FrameworkPayload>('/api/frameworks', 'POST', framework);

/** Removes a framework and the components belonging to it. */
export const deleteFramework = (id: string): Promise<unknown> =>
  apiSend(`/api/frameworks/${id}`, 'DELETE');
