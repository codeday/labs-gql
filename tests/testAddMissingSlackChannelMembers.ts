import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

// NOTE: importing the SUT (src/slack/addMissingSlackChannelMembers) transitively
// loads src/utils (for makeDebug / notNullable), which re-exports modules that
// import src/config and src/enums. src/config throws at load time unless a long
// list of env vars is present (no .env is checked into the repo), and src/enums
// registers type-graphql enums at load time which requires the reflect-metadata
// polyfill (imported above). Stub the env vars BEFORE requiring the SUT.
// TypeScript's CommonJS output preserves source order for `import` vs. the
// following statements, and these stubs run before the SUT's module graph loads.
const REQUIRED_ENV_VARS = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN',
  'LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY',
  'PLACID_API_TOKEN', 'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];
for (const k of REQUIRED_ENV_VARS) {
  if (!process.env[k]) process.env[k] = 'test-stub';
}
if (!process.env.EMAIL_PORT) process.env.EMAIL_PORT = '25';

// tsx (esbuild) captures named-import bindings by value at the SUT's load
// time, so mutating the module's export AFTER the SUT is loaded has no effect.
// Instead, pre-populate `require.cache` with a stub for getSlackClientForEvent
// BEFORE loading the SUT, so the SUT's `require("./getSlackClientForEvent")`
// returns our stub. The stub returns whatever `currentSlackMock` is set to.
let currentSlackMock: any = null;
require.cache[require.resolve('../src/slack/getSlackClientForEvent')] = {
  exports: {
    __esModule: true,
    getSlackClientForEvent: () => currentSlackMock,
  },
} as any;

// Require the SUT AFTER env stubs and the cache pre-pop are in place.
const { addMissingSlackChannelMembers } = require('../src/slack/addMissingSlackChannelMembers');

type InviteCall = { channel: string; users: string };

// A minimal mock of the pieces of `@slack/web-api`'s WebClient that
// `addMissingSlackChannelMembers` uses. `existingByChannel` maps a channel id
// to the array of member ids already in that channel.
function makeMockSlack(existingByChannel: Record<string, string[]>) {
  const inviteCalls: InviteCall[] = [];
  const slack = {
    conversations: {
      members: async (args: { channel: string }) => ({
        ok: true,
        members: existingByChannel[args.channel] ?? [],
      }),
      invite: async (args: { channel: string; users: string }) => {
        inviteCalls.push({ channel: args.channel, users: args.users });
        return { ok: true };
      },
    },
  };
  return { slack, inviteCalls };
}

// Build a SlackEventWithProjects-shaped object with optional null slackIds.
function makeEvent(opts: {
  mentorChannelId: string | null;
  projects: Array<{
    slackChannelId: string | null;
    mentors: Array<{ slackId: string | null }>;
    students?: Array<{ slackId: string | null }>;
  }>;
}) {
  return {
    id: 'event-1',
    name: 'Test Event',
    slackWorkspaceId: 'WSID',
    slackWorkspaceAccessToken: 'token',
    slackUserGroupId: null,
    slackMentorChannelId: opts.mentorChannelId,
    projects: opts.projects.map((p) => ({
      id: 'project-1',
      slackChannelId: p.slackChannelId,
      mentors: p.mentors,
      students: p.students ?? [],
    })),
  } as any;
}

// Guards the mentor-channel block: the invite payload must contain only the
// missing mentor IDs, never the already-present ones. This is the exact
// regression that previously made Slack reject the whole call with
// `already_in_channel` (force defaults to false), silently excluding every
// newly-joined mentor from the channel until an admin intervened by hand.
test('mentor-channel invite sends only the missing mentor ids, not all of them', async () => {
  const { slack, inviteCalls } = makeMockSlack({ CMENTOR: ['A', 'B'] });
  currentSlackMock = slack;
  const event = makeEvent({
    mentorChannelId: 'CMENTOR',
    projects: [
      { slackChannelId: null, mentors: [{ slackId: 'A' }, { slackId: 'B' }, { slackId: 'C' }] },
    ],
  });

  await addMissingSlackChannelMembers(event);

  const mentorInvite = inviteCalls.find((c) => c.channel === 'CMENTOR');
  assert.ok(mentorInvite, 'should issue a mentor-channel invite when a mentor is missing');
  assert.equal(
    mentorInvite!.users, 'C',
    'should invite ONLY the missing mentor; inviting already-present mentors makes Slack reject the whole call',
  );
});

// Guards the parallel per-project block against the same wrong-variable-in-
// invite-payload class of regression. This block was already correct; the test
// pins that behavior so a future refactor does not reintroduce the bug there.
test('per-project invite sends only the missing member ids, not all of them', async () => {
  const { slack, inviteCalls } = makeMockSlack({ CPROJ: ['A', 'B'] });
  currentSlackMock = slack;
  const event = makeEvent({
    mentorChannelId: null,
    projects: [{
      slackChannelId: 'CPROJ',
      students: [{ slackId: 'A' }, { slackId: 'C' }],
      mentors: [{ slackId: 'B' }],
    }],
  });

  await addMissingSlackChannelMembers(event);

  const projInvite = inviteCalls.find((c) => c.channel === 'CPROJ');
  assert.ok(projInvite, 'should issue a project-channel invite when a member is missing');
  assert.equal(
    projInvite!.users, 'C',
    'project invite must include only the missing id, never the already-present ones',
  );
});
