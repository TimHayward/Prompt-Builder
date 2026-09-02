/**
 * Request validation helpers for the API routes
 *
 * Every route parses its body through here, so a malformed payload is rejected
 * the same way everywhere — HTTP 400, a readable message, field-level detail —
 * and is rejected before any database work starts, never part-way through.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ErrorResponse } from '@/types/contracts';

/** A validated body, or the response to return instead. */
export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<ErrorResponse> };

/** Builds the error body every route returns on failure. */
export const errorResponse = (
  message: string,
  status: number,
  details?: ErrorResponse['details']
): NextResponse<ErrorResponse> =>
  NextResponse.json(details ? { error: message, details } : { error: message }, { status });

/**
 * Reads and validates a JSON request body
 * @param request - The incoming request
 * @param schema - The contract the body must satisfy
 * @returns The parsed body, or a 400 response describing what was wrong
 */
export const parseRequestBody = async <T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ParseResult<T>> => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { ok: false, response: errorResponse('Invalid JSON format in request body', 400) };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    const details = result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(body)',
      message: issue.message,
    }));

    // The first issue reads best as the summary; the rest stay in details.
    return {
      ok: false,
      response: errorResponse(details[0]?.message ?? 'Invalid request body', 400, details),
    };
  }

  return { ok: true, data: result.data };
};
