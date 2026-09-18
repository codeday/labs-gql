import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as dotenv from 'dotenv';

// The production module imports `makeDebug`/`PickNonNullable` through the
// `../utils` barrel, which transitively loads `src/config.ts` (validates a
// large set of env vars at import time). `import` is hoisted above statements
// in the esbuild/tsx CJS transform, so to guarantee the env guard runs before
// the system-under-test is loaded we: (a) use `import type` for the type-only
// imports (erased at runtime, so the types barrel never loads config), and
// (b) load `.env.test.example` (shipped in the repo for offline tests) via a
// runtime `require` placed AFTER dotenv.config.
dotenv.config({ path: '.env.test.example' });
const { linkExistingSlackMembers, normalizeEmail } =
    require('../src/slack/linkExistingSlackMembers') as typeof import('../src/slack/linkExistingSlackMembers');

import type { SlackEventWithProjects, SlackMentorInfo, SlackStudentInfo } from '../src/slack/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Calls = {
    studentFindMany: any[];
    mentorFindMany: any[];
    studentUpdate: any[];
    mentorUpdate: any[];
    studentUpdateMany: any[];
    mentorUpdateMany: any[];
};

function makeMockPrisma(opts: { previousStudents?: any[]; previousMentors?: any[] } = {}) {
    const previousStudents = opts.previousStudents ?? [];
    const previousMentors = opts.previousMentors ?? [];
    const calls: Calls = {
        studentFindMany: [],
        mentorFindMany: [],
        studentUpdate: [],
        mentorUpdate: [],
        studentUpdateMany: [],
        mentorUpdateMany: [],
    };
    const prisma = {
        student: {
            findMany: async (args: any) => { calls.studentFindMany.push(args); return previousStudents; },
            update: async (args: any) => { calls.studentUpdate.push(args); return {}; },
            updateMany: async (args: any) => { calls.studentUpdateMany.push(args); return { count: 1 }; },
        },
        mentor: {
            findMany: async (args: any) => { calls.mentorFindMany.push(args); return previousMentors; },
            update: async (args: any) => { calls.mentorUpdate.push(args); return {}; },
            updateMany: async (args: any) => { calls.mentorUpdateMany.push(args); return { count: 1 }; },
        },
    };
    return { prisma, calls };
}

function makeSlack(members: any[]) {
    return {
        paginate: async () => members,
    } as any;
}

function makeEvent(opts: { students?: any[]; mentors?: any[] } = {}) {
    return {
        id: 'evt-1',
        name: 'Test Event',
        slackWorkspaceAccessToken: 'xoxb-token',
        slackWorkspaceId: 'T-team',
        slackMentorChannelId: 'C-mentor',
        slackUserGroupId: null,
        projects: [{
            id: 'proj-1',
            slackChannelId: 'C-proj',
            students: opts.students ?? [],
            mentors: opts.mentors ?? [],
        }],
    } as SlackEventWithProjects<SlackStudentInfo & SlackMentorInfo>;
}

function member(id: string, email: string | undefined, opts: { deleted?: boolean } = {}) {
    return {
        id,
        deleted: opts.deleted ?? false,
        profile: email === undefined ? {} : { email },
    };
}

// ---------------------------------------------------------------------------
// normalizeEmail (pure unit)
// ---------------------------------------------------------------------------

test('normalizeEmail lowercases and trims surrounding whitespace', () => {
    assert.equal(normalizeEmail('First.Last@Company.com'), 'first.last@company.com');
    assert.equal(normalizeEmail('  Hello@World.COM  '), 'hello@world.com');
    assert.equal(normalizeEmail('MIXED@Case.Org'), 'mixed@case.org');
    assert.equal(normalizeEmail('already@lower.com'), 'already@lower.com');
});

// ---------------------------------------------------------------------------
// users.list join: the core case-mismatch bug
// ---------------------------------------------------------------------------

test('links a student whose DB email casing differs from Slack (the reported bug)', async () => {
    const student = { id: 'stu-test', email: 'First.Last@Company.com', slackId: null };
    const event = makeEvent({ students: [student] });
    const members = [member('U-TEST', 'first.last@company.com')];
    const { prisma, calls } = makeMockPrisma();
    const slack = makeSlack(members);

    await linkExistingSlackMembers(event, { prisma, slack });

    // The case-mismatched student must be linked via users.list.
    assert.equal(calls.studentUpdateMany.length, 1);
    assert.deepEqual(calls.studentUpdateMany[0], {
        where: { id: 'stu-test' },
        data: { slackId: 'U-TEST' },
    });
});

test('links a mentor whose DB email casing differs from Slack', async () => {
    const mentor = { id: 'men-test', email: 'Mentor.One@Company.com', givenName: 'M', surname: 'T', slackId: null };
    const event = makeEvent({ mentors: [mentor] });
    const members = [member('U-MENTOR', 'mentor.one@company.com')];
    const { prisma, calls } = makeMockPrisma();
    const slack = makeSlack(members);

    await linkExistingSlackMembers(event, { prisma, slack });

    assert.equal(calls.mentorUpdateMany.length, 1);
    assert.deepEqual(calls.mentorUpdateMany[0], {
        where: { id: 'men-test' },
        data: { slackId: 'U-MENTOR' },
    });
});

test('links a student whose DB email has surrounding whitespace Slack lacks', async () => {
    // Guards the `.trim()` half of normalizeEmail, which a future refactor
    // might drop while keeping `.toLowerCase()`.
    const student = { id: 'stu-trim', email: '  Trim@Test.COM  ', slackId: null };
    const event = makeEvent({ students: [student] });
    const members = [member('U-TRIM', 'trim@test.com')];
    const { prisma, calls } = makeMockPrisma();
    const slack = makeSlack(members);

    await linkExistingSlackMembers(event, { prisma, slack });

    assert.equal(calls.studentUpdateMany.length, 1);
    assert.deepEqual(calls.studentUpdateMany[0], {
        where: { id: 'stu-trim' },
        data: { slackId: 'U-TRIM' },
    });
});

// ---------------------------------------------------------------------------
// previousParticipants: now case-insensitive
// ---------------------------------------------------------------------------

test('previousParticipants copies a prior-event slackId across casings and runs before users.list', async () => {
    const current = { id: 'stu-bob', email: 'Bob.Smith@Company.com', slackId: null };
    const event = makeEvent({ students: [current] });
    const previousStudents = [{ email: 'bob.smith@company.com', slackId: 'U-BOB-PRIOR' }];
    const { prisma, calls } = makeMockPrisma({ previousStudents });
    // Even if a matching Slack member exists, the prior copy should win and
    // remove the student from the search set so users.list does NOT re-link.
    const slack = makeSlack([member('U-BOB-SLACK', 'bob.smith@company.com')]);

    await linkExistingSlackMembers(event, { prisma, slack });

    // The Prisma previousParticipants query must request mode: 'insensitive'
    // so a lowercased prior-event email matches the mixed-case apply-time key.
    assert.equal(calls.studentFindMany.length, 1);
    assert.equal(calls.studentFindMany[0].where.email.mode, 'insensitive');
    assert.equal(calls.studentUpdate.length, 1);
    assert.deepEqual(calls.studentUpdate[0], {
        where: { id: 'stu-bob' },
        data: { slackId: 'U-BOB-PRIOR' },
    });
    // The student was removed from searchStudents before the users.list join,
    // so updateMany (the users.list path) must NOT run for bob.
    assert.equal(calls.studentUpdateMany.length, 0);
});
