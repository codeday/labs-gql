import { Event, PrStatus, PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Badgr, badgrLogin } from '../../badgr';
import { Context } from '../../context';
import { PickNonNullable, makeDebug } from "../../utils";
import { stringify } from 'csv-stringify/sync';
import { DateTime } from "luxon";
import { getSlackClientForEvent } from "../../slack";
import config from "../../config";

const DEBUG = makeDebug('activities:tasks:issueBadge');

interface IssueBadgeArgs {
  badgeClassEntityId?: string
}

const BADGES = [
  {
    id: 'zxfYQMucSLGw7KASwnCSdQ',
    name: 'Micro-Intern (Students)',
    target: 'student',
  },
  {
    id: 'UaCNNCJxTxqK9C8N1UIjpA',
    name: 'Labs Intern (Students)',
    target: 'student',
  },
  {
    id: 'pxelruBlQayczY-qLfwmKQ',
    name: 'Open-Source Contributor (Students)',
    target: 'studentWithPr',
  },
  {
    id: 'nrd2fZ1_R9SVo6YvxaoyeA',
    name: 'Software Development Mentor (Mentors)',
    target: 'mentor',
  }
];
const BADGES_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]));

export const SCHEMA = {
  type: 'object',
  required: ['badgeClassEntityId'],
  properties: {
    badgeClassEntityId: {
      type: 'string',
      title: 'Badge Class ID',
      enum: BADGES.map(b => b.id),
      enumNames: BADGES.map(b => b.name),
    },
  },
}

export default async function issueBadge({ auth }: Context, args: Partial<IssueBadgeArgs> | undefined): Promise<void> {
  const prisma = Container.get(PrismaClient);

  if (!args || !args.badgeClassEntityId || !(args.badgeClassEntityId in BADGES_BY_ID)) {
    throw new Error(`Must specify badgeClassEntityId in arguments.`);
  }
  const target = BADGES_BY_ID[args.badgeClassEntityId].target;
  const event = await prisma.event.findUnique({ where: { id: auth.eventId! } });

  const badgr = await badgrLogin(config.badgr.username, config.badgr.password);

  if (target === 'student' || target === 'studentWithPr') {
    const students = await prisma.student.findMany({
      where: {
        eventId: auth.eventId!,
        status: 'ACCEPTED',
        projects: {
          some: {
            status: 'MATCHED',
            ...(target !== 'studentWithPr'
              ? {}
              : { prUrl: { not: null } }
            ),
          },
        },
      },
      include: { projects: { where: { prUrl: { not: null } } } },
    });

    for (const student of students) {
      try {
        DEBUG(`Issuing student badge to ${student.email}`);
        await badgr.v2.issuersAssertionsCreate(
          config.badgr.issuerEntityId,
          {
            badgeclass: args.badgeClassEntityId,
            narrative: event?.name,
            allowDuplicateAwards: true,
            recipient: {
              type: 'email',
              hashed: false,
              identity: student.email,
              plaintextIdentity: student.email,
            },
            extensions: {
              'extensions:recipientProfile': {
                '@context': 'https://openbadgespec.org/extensions/recipientProfile/context.json',
                name: `${student.givenName} ${student.surname}`,
                type: ['Extension', 'extensions:RecipientProfile']
              }
            } as unknown as string,
            evidence: student.projects.map(p => ({ url: p.prUrl! })),
        });
      } catch (ex) { DEBUG(ex); }
    }
  } else if (target === 'mentor') {
    const mentors = await prisma.mentor.findMany({
      where: {
        eventId: auth.eventId!,
        status: 'ACCEPTED',
        projects: { some: { status: 'MATCHED' } },
      },
    });

    for (const mentor of mentors) {
      try {
        DEBUG(`Issuing mentor badge to ${mentor.email}`);
        await badgr.v2.issuersAssertionsCreate(
          config.badgr.issuerEntityId,
          {
            badgeclass: args.badgeClassEntityId,
            narrative: event?.name,
            allowDuplicateAwards: true,
            recipient: {
              type: 'email',
              hashed: false,
              identity: mentor.email,
              plaintextIdentity: mentor.email,
            },
            extensions: {
              'extensions:recipientProfile': {
                '@context': 'https://openbadgespec.org/extensions/recipientProfile/context.json',
                name: `${mentor.givenName} ${mentor.surname}`,
                type: ['Extension', 'extensions:RecipientProfile']
              }
            } as unknown as string,
            evidence: [],
        });
      } catch (ex) { DEBUG(ex); }
    }
  }
}