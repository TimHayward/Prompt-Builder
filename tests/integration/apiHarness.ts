/**
 * Integration harness
 *
 * Runs the real route handlers against a real SQLite database in a temporary
 * directory. The unit tests mock fetch, so nothing else proves that a route, a
 * constraint and a migration still agree with each other.
 *
 * The database is opened lazily by src/lib/db.ts, so pointing
 * PROMPT_BUILDER_DATA_DIR at a temp directory before the first query is enough
 * to keep a run away from the developer's own data.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** What a route handler returns, unwrapped. */
export type ApiResult<T = any> = {
  status: number;
  body: T;
};

type RouteHandler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
type CollectionHandler = (request: Request) => Promise<Response>;

export type CallOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Route params for a dynamic route, e.g. { id }. */
  params?: Record<string, string>;
  /** Path recorded on the Request; handlers read params, not the URL. */
  path?: string;
};

/**
 * Points the application at a fresh database for the duration of a test file
 * @returns The temp directory, and a teardown that closes and removes it
 */
export const useTemporaryDatabase = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'prompt-builder-test-'));
  const previous = process.env.PROMPT_BUILDER_DATA_DIR;
  process.env.PROMPT_BUILDER_DATA_DIR = directory;

  /**
   * Fails if the application would open anything but the temp database.
   * Called once the routes are imported, so a mistake here stops the run rather
   * than quietly writing into the developer's own library.
   */
  const assertIsolated = async () => {
    const { resolveDatabasePath } = await import('@/lib/db');
    const resolved = resolveDatabasePath();

    if (!resolved.file.startsWith(directory)) {
      throw new Error(
        `Integration tests would use ${resolved.file}, which is outside the temp directory ${directory}`
      );
    }
  };

  const cleanup = async () => {
    // Close the handle first: Windows will not remove an open SQLite file.
    const { closeDatabase } = await import('@/lib/db');
    closeDatabase();

    if (previous === undefined) {
      delete process.env.PROMPT_BUILDER_DATA_DIR;
    } else {
      process.env.PROMPT_BUILDER_DATA_DIR = previous;
    }

    rmSync(directory, { recursive: true, force: true });
  };

  return { directory, cleanup, assertIsolated };
};

/** Builds the Request a handler expects. */
const buildRequest = (options: CallOptions): Request => {
  const method = options.method ?? 'GET';
  const url = `http://localhost${options.path ?? '/api'}`;

  if (options.body === undefined) {
    return new Request(url, { method });
  }

  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    // A string body is passed through, so a test can send malformed JSON.
    body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
};

/** Reads a handler's response, tolerating an empty body. */
const readResponse = async <T>(response: Response): Promise<ApiResult<T>> => {
  const text = await response.text();
  let body: unknown;

  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  return { status: response.status, body: body as T };
};

/**
 * Calls a collection route handler, e.g. GET /api/prompts
 * @param handler - The exported handler
 * @param options - Method and body
 */
export const call = async <T = any>(
  handler: CollectionHandler,
  options: CallOptions = {}
): Promise<ApiResult<T>> => readResponse<T>(await handler(buildRequest(options)));

/**
 * Calls a dynamic route handler, e.g. PUT /api/prompts/[id]
 * @param handler - The exported handler
 * @param options - Method, body and the route params
 */
export const callWithParams = async <T = any>(
  handler: RouteHandler,
  options: CallOptions = {}
): Promise<ApiResult<T>> =>
  readResponse<T>(
    await handler(buildRequest(options), { params: Promise.resolve(options.params ?? {}) })
  );
