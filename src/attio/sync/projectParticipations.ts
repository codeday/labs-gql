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
}

function toDateOnlyString(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export interface ProjectionResult {
  participations: Participation[];
  badEmailInteractionIds: string[];
}

/**
 * Stage B: one read-only UNION ALL query over Mentor and Student, each joined to Event.
 * Every Event row in this database is a Labs cohort (there's no separate "CodeDay Event"
 * source here), so eventType is hardcoded rather than derived from a nonexistent field.
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
      e."startsAt" AS "participatedAt"
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
      e."startsAt" AS "participatedAt"
    FROM "Student" s
    INNER JOIN "Event" e ON e.id = s."eventId"
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

    participations.push({
      interactionId: row.interactionId,
      participationType: row.participationType,
      eventType: 'Labs',
      event: row.event,
      email: normalizedEmail,
      givenName: row.givenName,
      surname: row.surname,
      participatedAt: toDateOnlyString(row.participatedAt),
    });
  }

  const limited = limit !== undefined ? participations.slice(0, limit) : participations;

  return { participations: limited, badEmailInteractionIds };
}
