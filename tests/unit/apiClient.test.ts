/**
 * A failed request must surface as a thrown, typed error — the bug this guards
 * against is an HTTP 400 or 500 resolving quietly and the UI treating a rejected
 * save as a successful one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, apiSend, describeApiFailure, NetworkError } from '@/lib/apiClient';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns the parsed body on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ id: 'p1' }])));

    await expect(apiRequest('/api/prompts')).resolves.toEqual([{ id: 'p1' }]);
  });

  it('throws an ApiError carrying the status and the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Prompt not found' }, 404)));

    const error = await apiRequest('/api/prompts/missing').catch(caught => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('Prompt not found');
  });

  it('keeps validation detail from a 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: 'Prompt name is required', details: [{ path: 'name', message: 'Prompt name is required' }] },
          400
        )
      )
    );

    const error = (await apiSend('/api/prompts', 'POST', {}).catch(caught => caught)) as ApiError;

    expect(error.details).toEqual([{ path: 'name', message: 'Prompt name is required' }]);
    expect(describeApiFailure(error)).toBe('Prompt name is required (name)');
  });

  it('throws a NetworkError when the request never completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const error = await apiRequest('/api/prompts').catch(caught => caught);

    expect(error).toBeInstanceOf(NetworkError);
    expect(describeApiFailure(error)).toMatch(/not saved/);
  });

  it('does not choke on an error response with no body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

    const error = (await apiRequest('/api/prompts').catch(caught => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Request failed with status 500');
  });
});

describe('describeApiFailure', () => {
  it('falls back to the caller\'s message for an unknown throw', () => {
    expect(describeApiFailure({}, 'Could not save.')).toBe('Could not save.');
  });
});
