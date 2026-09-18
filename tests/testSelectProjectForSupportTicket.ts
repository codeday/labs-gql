import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProjectForSupportTicket } from '../src/linear/selectProjectForSupportTicket';

type P = { id: string; name: string };
const projectA: P = { id: 'proj-a', name: 'A' };
const projectB: P = { id: 'proj-b', name: 'B' };
const projectC: P = { id: 'proj-c', name: 'C' };

// --- single project (the common, designed-matching case): unchanged behaviour ----------

test('single project without projectId returns the only project', () => {
    assert.equal(selectProjectForSupportTicket([projectA]), projectA);
});

test('single project with a matching projectId returns it', () => {
    assert.equal(selectProjectForSupportTicket([projectA], 'proj-a'), projectA);
});

test('single project with a non-matching projectId throws a membership error', () => {
    assert.throws(
        () => selectProjectForSupportTicket([projectA], 'proj-b'),
        /not a member/,
    );
});

// --- multiple projects: must be caller-chosen (the bug fix) ---------------------------

test('multiple projects without projectId fail closed instead of guessing projects[0]', () => {
    assert.throws(
        () => selectProjectForSupportTicket([projectA, projectB]),
        /multiple projects/,
    );
});

test('multiple projects fail closed regardless of list order', () => {
    // The bug selected `projects[0]` regardless of order; the fix must not depend on order.
    assert.throws(
        () => selectProjectForSupportTicket([projectB, projectA]),
        /multiple projects/,
    );
});

test('multiple projects with a valid projectId return the caller-chosen project', () => {
    assert.equal(selectProjectForSupportTicket([projectA, projectB], 'proj-b'), projectB);
});

test('multiple projects return the chosen project even when it is also projects[0]', () => {
    // An explicit choice for proj-a must win on its own merits, not via accidental indexing.
    assert.equal(selectProjectForSupportTicket([projectA, projectB], 'proj-a'), projectA);
});

test('three projects with a valid projectId return the chosen project', () => {
    assert.equal(selectProjectForSupportTicket([projectA, projectB, projectC], 'proj-c'), projectC);
});

test('multiple projects with an invalid projectId throw a membership error', () => {
    assert.throws(
        () => selectProjectForSupportTicket([projectA, projectB], 'proj-x'),
        /not a member/,
    );
});

// --- generic shape: preserves the element identity (so the include shape is forwarded) -

test('the returned project is the identical object instance from the input list', () => {
    const result = selectProjectForSupportTicket([projectA, projectB], 'proj-b');
    assert.strictEqual(result, projectB);
});

// --- empty list: the resolver gates this with `length > 0`, but document the contract ---

test('an empty list without projectId fails closed', () => {
    assert.throws(
        () => selectProjectForSupportTicket([]),
        /multiple projects/,
    );
});

test('an empty list with a projectId reports a membership error', () => {
    assert.throws(
        () => selectProjectForSupportTicket([], 'proj-a'),
        /not a member/,
    );
});
