import { PrismaClient } from '@prisma/client';
import { Participation } from './types';

// Accepts either the top-level PrismaClient or an interactive-transaction client (both
// implement $queryRaw with the same signature) — the caller runs this inside a transaction
// so the advisory lock it holds and this query share the same underlying connection.
type QueryableClient = Pick<PrismaClient, '$queryRaw'>;

// Simple, deliberately permissive syntactic check — good enough to reject the
// null/blank/garbage cases we actually see, without trying to be a full RFC 5322 validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RawParticipationRow {
  interactionId: string;
  participationType: 'Mentor' | 'Student';
  event: string;
  email: string | null;
  givenName: string;
  surname: string;
  // $queryRaw doesn't consistently return Date objects for timestamp columns across query
  // engines/drivers — sometimes it's already an ISO string. Handle both.
  participatedAt: Date | string | null;
  // array_agg(...) over the project(s) linking this person to the other role (mentor<->student).
  // Same caveat as participatedAt: depending on the query engine this can come back as a real
  // JS array or as a Postgres array-literal string like '{a@example.com,b@example.com}'.
  relatedPersonEmails: string[] | string | null;
}

function toDateOnlyString(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function parsePgTextArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed === '{}' || trimmed === '') return [];
  return trimmed.replace(/^\{/, '').replace(/\}$/, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
}

export interface ProjectionResult {
  participations: Participation[];
  badEmailInteractionIds: string[];
}

/**
 * Stage B: one read-only UNION ALL query over Mentor and Student, each joined to Event.
 * Every Event row in this database is a Labs cohort (there's no separate "CodeDay Event"
 * source here), so eventType is hardcoded rather than derived from a nonexistent field.
 *
 * relatedPersonEmails comes from the Mentor<->Project<->Student join tables (a mentor's
 * students, or a student's mentors) via a correlated subquery, since it's a variable-length
 * list rather than a scalar column.
 *
 * Students with status REJECTED are excluded entirely — both as their own participation row
 * and from any mentor's relatedPersonEmails. A student already synced before being rejected
 * simply stops appearing in the projection; per the sync's never-delete rule, their existing
 * Attio entry is left as-is rather than removed or updated.
 */
export async function projectParticipations(prisma: QueryableClient, limit?: number): Promise<ProjectionResult> {
  const rows = await prisma.$queryRaw<RawParticipationRow[]>`
    SELECT
      m.id AS "interactionId",
      'Mentor' AS "participationType",
      e.name AS "event",
      m.email AS "email",
      m."givenName" AS "givenName",
      m.surname AS "surname",
      e."startsAt" AS "participatedAt",
      COALESCE((
        SELECT array_agg(DISTINCT s.email)
        FROM "_MentorToProject" mp
        INNER JOIN "_ProjectToStudent" ps ON ps."A" = mp."B"
        INNER JOIN "Student" s ON s.id = ps."B"
        WHERE mp."A" = m.id AND s.status != 'REJECTED'
      ), ARRAY[]::text[]) AS "relatedPersonEmails"
    FROM "Mentor" m
    INNER JOIN "Event" e ON e.id = m."eventId"

    UNION ALL

    SELECT
      s.id AS "interactionId",
      'Student' AS "participationType",
      e.name AS "event",
      s.email AS "email",
      s."givenName" AS "givenName",
      s.surname AS "surname",
      e."startsAt" AS "participatedAt",
      COALESCE((
        SELECT array_agg(DISTINCT m.email)
        FROM "_ProjectToStudent" ps
        INNER JOIN "_MentorToProject" mp ON mp."B" = ps."A"
        INNER JOIN "Mentor" m ON m.id = mp."A"
        WHERE ps."B" = s.id
      ), ARRAY[]::text[]) AS "relatedPersonEmails"
    FROM "Student" s
    INNER JOIN "Event" e ON e.id = s."eventId"
    WHERE s.status != 'REJECTED'
  `;

  const participations: Participation[] = [];
  const badEmailInteractionIds: string[] = [];

  for (const row of rows) {
    const normalizedEmail = row.email?.trim().toLowerCase() ?? '';
    if (!EMAIL_RE.test(normalizedEmail)) {
      badEmailInteractionIds.push(row.interactionId);
      // eslint-disable-next-line no-continue
      continue;
    }

    const relatedPersonEmails = parsePgTextArray(row.relatedPersonEmails)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e));
    const uniqueSortedRelated = Array.from(new Set(relatedPersonEmails)).sort();

    participations.push({
      interactionId: row.interactionId,
      participationType: row.participationType,
      eventType: 'Labs',
      event: row.event,
      email: normalizedEmail,
      givenName: row.givenName,
      surname: row.surname,
      participatedAt: toDateOnlyString(row.participatedAt),
      relatedPersonEmails: uniqueSortedRelated,
    });
  }

  const limited = limit !== undefined ? participations.slice(0, limit) : participations;

  return { participations: limited, badEmailInteractionIds };
}
