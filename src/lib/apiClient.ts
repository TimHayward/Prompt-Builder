/**
 * API client
 *
 * Every call to the app's own API goes through here. A bare `fetch` only
 * rejects on a network failure — an HTTP 400 or 500 resolves normally, so code
 * that only catches exceptions treats a rejected save as a successful one. This
 * checks the status, parses the body, and throws a typed error instead.
 */

import type { ErrorResponse } from '@/types/contracts';

/** A request that reached the server and came back as a failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: ErrorResponse['details'];

  constructor(message: string, status: number, details?: ErrorResponse['details']) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** A request that never got an answer — server down, offline, DNS. */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** True for both failure types, so callers can report either the same way. */
export const isApiFailure = (error: unknown): error is ApiError | NetworkError =>
  error instanceof ApiError || error instanceof NetworkError;

/**
 * Turns a failure into one line suitable for the UI.
 * @param error - Anything thrown by apiRequest
 * @param fallback - Used when the error carries nothing readable
 */
export const describeApiFailure = (error: unknown, fallback = 'Something went wrong'): string => {
  if (error instanceof ApiError) {
    const [firstDetail] = error.details ?? [];
    // Field-level detail is the useful half of a validation failure.
    return firstDetail && firstDetail.path !== '(body)'
      ? `${error.message} (${firstDetail.path})`
      : error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return error instanceof Error && error.message ? error.message : fallback;
};

/**
 * Performs a request against the app's API
 * @param path - Path beginning with /api
 * @param init - Standard fetch options
 * @returns The parsed JSON body
 * @throws {ApiError} When the server answers with a non-2xx status
 * @throws {NetworkError} When the request never completes
 */
export const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new NetworkError('Could not reach the server. Your change is not saved.', error);
  }

  // 204 and empty bodies are valid answers; treat them as no content.
  const rawBody = await response.text();
  let body: unknown = undefined;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = undefined;
    }
  }

  if (!response.ok) {
    const errorBody = body as ErrorResponse | undefined;
    throw new ApiError(
      errorBody?.error || `Request failed with status ${response.status}`,
      response.status,
      errorBody?.details
    );
  }

  return body as T;
};

/** Convenience wrapper for a JSON-bodied request. */
export const apiSend = <T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
  apiRequest<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
