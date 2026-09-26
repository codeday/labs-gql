/**
 * Regression tests for partner `forceTags` enforcement in project matching.
 *
 * Bug: `src/search/getProjectMatches.ts` gated the partner force-tags `must` clause on
 * `partner.forbidTags.length > 0` instead of `partner.forceTags.length > 0`. When a partner
 * had `forceTags` set but `forbidTags` empty (a configuration the admin tooling permits), the
 * force-tags constraint silently vanished from the Elasticsearch query, and students of that
 * partner could be matched to projects missing the partner's required tags.
 *
 * These tests exercise the real `getProjectMatches` (via `buildQueryFor`) end-to-end with
 * stubbed Prisma + Elasticsearch, so they assert against the query body the actual source
 * emits — not a copy of the logic. They cover the triggering case and the full partner-tag
 * matrix to guard against regressions in either direction.
 *
 * Run: npx tsx tests/testPartnerForceTagsMatch.ts
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';

// Load test env BEFORE requiring the module under test: getProjectMatches transitively
// imports src/config, which throws at import time if required env vars are missing.
loadEnv({ path: '.env.test.example' });

import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'typedi';
import { PrismaClient, Track, TagType } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';

// Required via require() (not import) so it executes after loadEnv().
const { getProjectMatches } = require('../src/search/getProjectMatches');
import type { Student, Tag } from '../src/types';

interface PartnerStub {
  id: string;
  onlyAffine: boolean;
  forceTags: { id: string }[];
  forbidTags: { id: string }[];
}

/**
 * Build a stubbed Prisma + Elasticsearch environment, run `getProjectMatches` for a given
 * partner configuration, and return the Elasticsearch request body the source emitted.
 */
async function captureQueryForPartner(
  partner: PartnerStub | null,
  partnerCode: string | null = partner ? 'partner-1' : null,
): Promise<any> {
  let captured: any;

  const fakePrisma: any = {
    partner: {
      findFirst: async () => partner,
    },
    project: {
      findMany: async () => [],
    },
  };

  const fakeElastic: any = {
    search: async (params: any) => {
      captured = params.body;
      return { body: { hits: { hits: [] } } };
    },
  };

  Container.set(PrismaClient, fakePrisma);
  Container.set(Client, fakeElastic);

  const student = {
    id: 'student-1',
    partnerCode,
    eventId: 'event-1',
    weeks: 5,
    track: Track.BEGINNER,
    timezone: 'America/Los_Angeles',
    profile: {},
  } as unknown as Student;

  const tags = [
    { id: 'tag-tech-1', type: TagType.TECHNOLOGY },
    { id: 'tag-interest-1', type: TagType.INTEREST },
  ] as unknown as Tag[];

  await getProjectMatches(student, tags);
  return captured;
}

/**
 * Extract the top-level `bool.must` clauses array the source assembled (normalizing the
 * single-object form elastic-builder emits when there is exactly one clause).
 */
function mustClauses(queryBody: any): any[] {
  const bool = queryBody?.query?.function_score?.query?.bool;
  const must = bool?.must;
  if (must === undefined) return [];
  return Array.isArray(must) ? must : [must];
}

/** Pull the conjunctive `term` tag ids out of a nested `bool.must` clause (the force-tags shape). */
function forceTagIds(clauses: any[]): string[] {
  for (const clause of clauses) {
    const inner = clause?.bool?.must;
    if (!inner) continue;
    const terms = Array.isArray(inner) ? inner : [inner];
    if (terms.length && terms.every((t: any) => t?.term && 'tags' in t.term)) {
      return terms.map((t: any) => t.term.tags);
    }
  }
  return [];
}

/** Pull the `term` tag ids out of a nested `bool.must_not` clause (the forbid-tags shape). */
function forbidTagIds(clauses: any[]): string[] {
  for (const clause of clauses) {
    const inner = clause?.bool?.must_not;
    if (!inner) continue;
    const terms = Array.isArray(inner) ? inner : [inner];
    if (terms.length && terms.every((t: any) => t?.term && 'tags' in t.term)) {
      return terms.map((t: any) => t.term.tags);
    }
  }
  return [];
}

/** True if the eventId match clause survived in the assembled query (regression guard). */
function hasEventIdClause(clauses: any[], eventId: string): boolean {
  return clauses.some((c) => c?.match?.eventId === eventId);
}

// --- The bug: forceTags set, forbidTags empty ------------------------------------------

test('forceTags are enforced when forbidTags is empty (the reported bug)', async () => {
  const partner: PartnerStub = {
    id: 'partner-1',
    onlyAffine: false,
    forceTags: [{ id: 'force-1' }, { id: 'force-2' }],
    forbidTags: [],
  };

  const query = await captureQueryForPartner(partner);
  const clauses = mustClauses(query);

  // Before the fix, partnerForceTags was `undefined` here and was dropped by `.filter(Boolean)`,
  // leaving no required-tag constraint at all.
  assert.deepEqual(forceTagIds(clauses), ['force-1', 'force-2'],
    'Both force-tag term queries must be present in bool.must when forceTags is set');
  assert.deepEqual(forbidTagIds(clauses), [],
    'No forbid clause should be emitted when forbidTags is empty');
  assert.ok(hasEventIdClause(clauses, 'event-1'),
    'The eventId (and other baseline) clauses must still be present');
});

// --- Control: both set (was already working) -------------------------------------------

test('forceTags and forbidTags are both enforced when both are set', async () => {
  const partner: PartnerStub = {
    id: 'partner-1',
    onlyAffine: false,
    forceTags: [{ id: 'force-1' }],
    forbidTags: [{ id: 'forbid-1' }],
  };

  const query = await captureQueryForPartner(partner);
  const clauses = mustClauses(query);

  assert.deepEqual(forceTagIds(clauses), ['force-1'],
    'forceTags clause is present when both forceTags and forbidTags are set');
  assert.deepEqual(forbidTagIds(clauses), ['forbid-1'],
    'forbidTags clause is present when both are set');
});

// --- Regression guard: forbidTags-only behavior unchanged -------------------------------

test('forbidTags is still enforced when forceTags is empty', async () => {
  const partner: PartnerStub = {
    id: 'partner-1',
    onlyAffine: false,
    forceTags: [],
    forbidTags: [{ id: 'forbid-1' }, { id: 'forbid-2' }],
  };

  const query = await captureQueryForPartner(partner);
  const clauses = mustClauses(query);

  assert.deepEqual(forceTagIds(clauses), [],
    'No force clause is emitted when forceTags is empty');
  assert.deepEqual(forbidTagIds(clauses), ['forbid-1', 'forbid-2'],
    'forbidTags clause is present (symmetric gating preserved)');
});

// --- Both empty / no constraint --------------------------------------------------------

test('neither forceTags nor forbidTags clauses are added when both are empty', async () => {
  const partner: PartnerStub = {
    id: 'partner-1',
    onlyAffine: false,
    forceTags: [],
    forbidTags: [],
  };

  const query = await captureQueryForPartner(partner);
  const clauses = mustClauses(query);

  assert.deepEqual(forceTagIds(clauses), []);
  assert.deepEqual(forbidTagIds(clauses), []);
  assert.ok(hasEventIdClause(clauses, 'event-1'),
    'Baseline clauses remain even with no partner tags configured');
});

// --- No partner at all ----------------------------------------------------------------

test('no tag clauses and no crash when the student has no partnerCode', async () => {
  // partnerCode null -> the source never calls prisma.partner.findFirst (partner is null).
  const query = await captureQueryForPartner(null, null);
  const clauses = mustClauses(query);

  assert.deepEqual(forceTagIds(clauses), []);
  assert.deepEqual(forbidTagIds(clauses), []);
  assert.ok(hasEventIdClause(clauses, 'event-1'),
    'Baseline clauses remain when the student has no partner');
});
