// @vitest-environment node
/**
 * Frameworks against a real database.
 *
 * The invariant under test is R2's: a component id is immutable and its label
 * is not. Renaming, re-describing and reordering must all reach the frameworks
 * without rewriting a single stored prompt, because a prompt section holds the
 * id and nothing else.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, callWithParams, useTemporaryDatabase } from './apiHarness';
import type { FrameworkPayload } from '@/types/contracts';
import type { Prompt } from '@/types';

const temp = useTemporaryDatabase();

let frameworks: typeof import('@/app/api/frameworks/route');
let prompts: typeof import('@/app/api/prompts/route');
let prompt: typeof import('@/app/api/prompts/[id]/route');

beforeAll(async () => {
  frameworks = await import('@/app/api/frameworks/route');
  prompts = await import('@/app/api/prompts/route');
  prompt = await import('@/app/api/prompts/[id]/route');
  await temp.assertIsolated();
}, 30000);

afterAll(temp.cleanup);

const readAll = () => call<FrameworkPayload[]>(frameworks.GET);
const save = (body: FrameworkPayload) =>
  call<FrameworkPayload>(frameworks.POST, { method: 'POST', body });

const find = async (id: string) => {
  const all = await readAll();
  return all.body.find(framework => framework.id === id);
};

describe('the seeded frameworks', () => {
  it('are the five that used to be hard-coded, in order', async () => {
    const read = await readAll();

    expect(read.status).toBe(200);
    expect(read.body.map(f => f.id)).toEqual(['standard', 'rctcso', 'gcse', 'rise', 'risen']);
  });

  it('give Standard its components with Role first', async () => {
    const standard = await find('standard');

    expect(standard?.components.map(c => c.id)).toEqual([
      'role',
      'instruction',
      'context',
      'format',
      'style',
    ]);
  });

  it('carry the ids a stored prompt already references', async () => {
    // Seeding under any other id would orphan every existing prompt.
    const standard = await find('standard');

    expect(standard?.components.map(c => c.label)).toEqual([
      'Role',
      'Instruction',
      'Context',
      'Format',
      'Style',
    ]);
  });
});

describe('editing a framework', () => {
  it('renames it without touching any prompt', async () => {
    const created = (
      await call<Prompt>(prompts.POST, {
        method: 'POST',
        body: {
          name: 'Uses RCTCSO',
          sections: [{ id: 's1', name: 'Task', content: 'Do it.', type: 'task' }],
        },
      })
    ).body;
    const before = await callWithParams<Prompt>(prompt.GET, { params: { id: created.id } });

    const rctcso = (await find('rctcso'))!;
    const renamed = await save({ ...rctcso, label: 'RCTCSO' });

    expect(renamed.body.label).toBe('RCTCSO');
    // The propagation requirement: the prompt is byte-identical, because a
    // section stores the component id and the framework name is derived.
    const after = await callWithParams<Prompt>(prompt.GET, { params: { id: created.id } });
    expect(after.body.sections).toEqual(before.body.sections);
  });

  it('relabels a component while keeping its id', async () => {
    const gcse = (await find('gcse'))!;
    const goal = gcse.components.find(c => c.id === 'goal')!;

    await save({
      ...gcse,
      components: gcse.components.map(c => (c.id === 'goal' ? { ...c, label: 'Objective' } : c)),
    });

    const updated = await find('gcse');
    const relabelled = updated?.components.find(c => c.id === 'goal');
    expect(relabelled?.label).toBe('Objective');
    // The half that must never move.
    expect(relabelled?.id).toBe(goal.id);
  });

  it('stores a component description and example', async () => {
    const rise = (await find('rise'))!;

    await save({
      ...rise,
      description: 'Role, Input, Steps, Expectation',
      components: rise.components.map(c =>
        c.id === 'input'
          ? { ...c, description: 'What the model is given', example: 'A support transcript' }
          : c
      ),
    });

    const updated = await find('rise');
    expect(updated?.description).toBe('Role, Input, Steps, Expectation');
    const input = updated?.components.find(c => c.id === 'input');
    expect(input?.description).toBe('What the model is given');
    expect(input?.example).toBe('A support transcript');
  });

  it('reorders components to the order it was sent', async () => {
    const risen = (await find('risen'))!;
    const reversed = [...risen.components].reverse();

    await save({ ...risen, components: reversed });

    const updated = await find('risen');
    expect(updated?.components.map(c => c.id)).toEqual(reversed.map(c => c.id));
  });

  it('removes a component left out of the list', async () => {
    const risen = (await find('risen'))!;
    const without = risen.components.filter(c => c.id !== 'narrowing');

    await save({ ...risen, components: without });

    const updated = await find('risen');
    expect(updated?.components.map(c => c.id)).not.toContain('narrowing');
  });

  it('leaves a component another framework claimed alone', async () => {
    // role is seeded against standard, and rise lists it too. Removing it from
    // one framework must not delete the row the other depends on.
    const rise = (await find('rise'))!;

    await save({ ...rise, components: rise.components.filter(c => c.id !== 'role') });

    const standard = await find('standard');
    expect(standard?.components.map(c => c.id)).toContain('role');
  });
});

describe('creating a framework', () => {
  it('stores it with its components and reads it back', async () => {
    const saved = await save({
      id: 'custom-abc',
      label: 'A-B-C',
      description: 'Audience, Brief, Constraints',
      components: [
        {
          id: 'audience',
          label: 'Audience',
          description: 'Who it is for',
          example: 'New starters',
        },
        { id: 'brief', label: 'Brief', description: 'What is wanted', example: 'A one-pager' },
      ],
    });

    expect(saved.status).toBe(200);
    const created = await find('custom-abc');
    expect(created?.label).toBe('A-B-C');
    expect(created?.components.map(c => c.id)).toEqual(['audience', 'brief']);
  });

  it('accepts a prompt section using a component it defines', async () => {
    // What relaxing the section-type enum was for: this used to be rejected.
    const created = await call<Prompt>(prompts.POST, {
      method: 'POST',
      body: {
        name: 'Uses a custom framework',
        sections: [{ id: 's1', name: 'Who for', content: 'New starters.', type: 'audience' }],
      },
    });

    expect(created.status).toBe(201);
    const stored = await callWithParams<Prompt>(prompt.GET, { params: { id: created.body.id } });
    expect(stored.body.sections[0].type).toBe('audience');
  });

  it('rejects a framework with no name', async () => {
    const rejected = await call(frameworks.POST, {
      method: 'POST',
      body: { id: 'nameless', label: '', description: '', components: [] },
    });

    expect(rejected.status).toBe(400);
  });

  it('rejects a component with no name', async () => {
    const rejected = await call(frameworks.POST, {
      method: 'POST',
      body: {
        id: 'bad-component',
        label: 'Bad',
        description: '',
        components: [{ id: 'x', label: '', description: '', example: '' }],
      },
    });

    expect(rejected.status).toBe(400);
  });
});
