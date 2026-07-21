/**
 * Manual test script for weeklyLowStandupReport
 *
 * Prerequisites:
 * - Copy .env.test.example to .env (if you don't have a .env file):
 *     cp .env.test.example .env
 *
 * Run with:
 *   npx ts-node src/automation/tasks/weeklyLowStandupReport.manual-test.ts
 *
 * To test Slack channel lookup, set SLACK_BOT_TOKEN environment variable:
 *   SLACK_BOT_TOKEN=xoxb-your-token npx ts-node src/automation/tasks/weeklyLowStandupReport.manual-test.ts
 *
 * This tests the pure functions (findConsecutiveLowScores and formatStudentList)
 * imported from the actual implementation file to ensure tests stay in sync with code.
 * It also optionally tests Slack channel lookup if a token is provided.
 */

import 'reflect-metadata';
import { findConsecutiveLowScores, formatStudentList } from './weeklyLowStandupReport';
import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';
import { registerDi } from '../../di';
import Container from 'typedi';

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual:   ${actualStr}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('\n🧪 Testing findConsecutiveLowScores...\n');

// Test 1: Student with fewer than 2 results
const result1 = findConsecutiveLowScores({
  id: 'student-1',
  givenName: 'Alice',
  surname: 'Smith',
  slackId: 'U123456',
  projects: [],
  standupResults: [{ rating: 1 }],
}, 'Test Event');
assertEqual(result1, null, 'Should return null for student with < 2 results');

// Test 2: Student with two consecutive low scores
const result2 = findConsecutiveLowScores({
  id: 'student-2',
  givenName: 'Bob',
  surname: 'Jones',
  slackId: 'U789',
  projects: [
    {
      mentors: [
        {
          id: 'mentor-1',
          givenName: 'Morgan',
          surname: 'Lee',
          slackId: 'UMENTOR1',
        },
      ],
    },
  ],
  standupResults: [{ rating: 1 }, { rating: 1 }],
}, 'Test Event');
assert(result2 !== null, 'Should flag student with two consecutive scores of 1');
assert(result2?.givenName === 'Bob', 'Should preserve student name');
assert(result2?.lastTwoRatings[0] === 1 && result2?.lastTwoRatings[1] === 1, 'Should capture both ratings');
assert(result2?.assignedMentors.length === 1, 'Should include assigned mentor data');

// Test 3: Student with one low, one acceptable
const result3 = findConsecutiveLowScores({
  id: 'student-3',
  givenName: 'Charlie',
  surname: 'Brown',
  slackId: null,
  projects: [],
  standupResults: [{ rating: 1 }, { rating: 2 }],
}, 'Test Event');
assertEqual(result3, null, 'Should NOT flag student with 1 then 2');

// Test 4: Student with scores 2 or higher
const result4 = findConsecutiveLowScores({
  id: 'student-4',
  givenName: 'David',
  surname: 'Wilson',
  slackId: 'U456',
  projects: [],
  standupResults: [{ rating: 2 }, { rating: 3 }],
}, 'Test Event');
assertEqual(result4, null, 'Should NOT flag student with all scores >= 2');

// Test 5: Consecutive low scores in the middle
const result5 = findConsecutiveLowScores({
  id: 'student-5',
  givenName: 'Emily',
  surname: 'Davis',
  slackId: 'U999',
  projects: [],
  standupResults: [{ rating: 3 }, { rating: 1 }, { rating: 1 }, { rating: 3 }],
}, 'Test Event');
assert(result5 !== null, 'Should flag student with consecutive low scores in the middle');

// Test 6: Handle null ratings
const result6 = findConsecutiveLowScores({
  id: 'student-6',
  givenName: 'Frank',
  surname: 'Miller',
  slackId: null,
  projects: [],
  standupResults: [{ rating: null }, { rating: 1 }, { rating: 1 }],
}, 'Test Event');
assert(result6 !== null, 'Should flag when consecutive low scores exist (ignoring nulls)');

// Test 7: Only null ratings
const result7 = findConsecutiveLowScores({
  id: 'student-7',
  givenName: 'Grace',
  surname: 'Lee',
  slackId: null,
  projects: [],
  standupResults: [{ rating: null }, { rating: null }],
}, 'Test Event');
assertEqual(result7, null, 'Should NOT flag when only null ratings exist');

console.log('\n🧪 Testing formatStudentList...\n');

// Test 8: Format single student with Slack ID
const formatted1 = formatStudentList([{
  studentId: 'student-1',
  givenName: 'Alice',
  surname: 'Smith',
  slackId: 'U123456',
  assignedMentors: [
    {
      givenName: 'Morgan',
      surname: 'Lee',
      slackId: 'UMENTOR1',
    },
  ],
  eventName: 'Test Event',
  consecutiveLowScores: 2,
  lastTwoRatings: [1, 1],
}]);
assertEqual(formatted1, '• <@U123456> (Alice Smith) - Mentor: <@UMENTOR1>', 'Should format with Slack mention');

// Test 9: Format single student without Slack ID
const formatted2 = formatStudentList([{
  studentId: 'student-2',
  givenName: 'Bob',
  surname: 'Jones',
  slackId: null,
  assignedMentors: [],
  eventName: 'Test Event',
  consecutiveLowScores: 2,
  lastTwoRatings: [0, 1],
}]);
assertEqual(formatted2, '• Bob Jones (Bob Jones) - Mentor: Unassigned', 'Should format without Slack mention');

// Test 10: Format multiple students
const formatted3 = formatStudentList([
  {
    studentId: 'student-1',
    givenName: 'Alice',
    surname: 'Smith',
    slackId: 'U123',
    assignedMentors: [
      {
        givenName: 'Morgan',
        surname: 'Lee',
        slackId: 'UMENTOR1',
      },
    ],
    eventName: 'Test Event',
    consecutiveLowScores: 2,
    lastTwoRatings: [1, 1],
  },
  {
    studentId: 'student-2',
    givenName: 'Bob',
    surname: 'Jones',
    slackId: null,
    assignedMentors: [
      {
        givenName: 'Taylor',
        surname: 'Ng',
        slackId: null,
      },
    ],
    eventName: 'Test Event',
    consecutiveLowScores: 2,
    lastTwoRatings: [0, 1],
  },
]);
const expected = '• <@U123> (Alice Smith) - Mentor: <@UMENTOR1>\n• Bob Jones (Bob Jones) - Mentor: Taylor Ng';
assertEqual(formatted3, expected, 'Should format multiple students with newlines');

console.log('\n🧪 Testing Slack channel lookup...\n');

async function testSlackChannelLookup() {
  const slackToken = process.env.SLACK_BOT_TOKEN;

  if (!slackToken) {
    console.log('⏭️  Skipping Slack tests (set SLACK_BOT_TOKEN to test)\n');
    console.log('✨ All non-Slack tests passed!\n');
    return;
  }

  try {
    const slack = new WebClient(slackToken);

    // Test 1: List channels
    console.log('Fetching channel list from Slack...');
    const channelsList = await slack.conversations.list({
      exclude_archived: true,
      types: 'public_channel,private_channel',
      limit: 100,
    });

    assert(
      Array.isArray(channelsList.channels) && channelsList.channels.length > 0,
      'Should retrieve list of channels from Slack'
    );

    // Test 2: Find a specific channel
    const testChannelName = 'stats';
    const channel = channelsList.channels?.find(
      (c: any) => c.name === testChannelName
    );

    assert(
      channel !== undefined,
      `Should find #${testChannelName} channel in workspace`
    );

    if (channel) {
      console.log(`✅ Found channel: #${channel.name} (ID: ${channel.id})`);
    }

    // Test 3: Handle non-existent channel
    const nonExistentChannel = channelsList.channels?.find(
      (c: any) => c.name === 'this-channel-definitely-does-not-exist-xyz123'
    );

    assertEqual(
      nonExistentChannel,
      undefined,
      'Should NOT find a non-existent channel'
    );

    console.log('\n✨ All tests passed (including Slack)!\n');
  } catch (error: any) {
    console.error('\n❌ Slack test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.code === 'invalid_auth') {
      console.error('   The SLACK_BOT_TOKEN provided is invalid or expired.');
    }
    process.exit(1);
  }
}

console.log('\n🧪 Testing database access...\n');

async function testDatabaseAccess() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log('⏭️  Skipping database tests (DATABASE_URL not set in .env)\n');
    return;
  }

  try {
    registerDi();
    const prisma = Container.get(PrismaClient);

    // Test 1: Connect and query an event
    console.log('Connecting to database...');
    const eventCount = await prisma.event.count();
    assert(eventCount >= 0, 'Should connect to database and count events');
    console.log(`✅ Found ${eventCount} events in database`);

    // Test 2: Find an active event with Slack integration
    console.log('\nLooking for active event with Slack integration...');
    const event = await prisma.event.findFirst({
      where: {
        isActive: true,
        slackWorkspaceAccessToken: { not: null },
        slackWorkspaceId: { not: null },
      },
    });

    if (event) {
      console.log(`✅ Found active event: ${event.name} (${event.id})`);
      console.log(
        `   Slack workspace: ${event.slackWorkspaceId}`
      );
    } else {
      console.log(
        '⚠️  No active events with Slack integration found (this is OK for testing)'
      );
    }

    // Test 3: Query students for standup scores
    console.log('\nQuerying students with standup results...');
    const studentsWithScores = await prisma.student.findMany({
      where: {
        standupResults: {
          some: {
            rating: { lt: 2 },
          },
        },
      },
      include: {
        standupResults: {
          orderBy: { createdAt: 'desc' },
          take: 2,
        },
      },
      take: 5,
    });

    console.log(
      `✅ Found ${studentsWithScores.length} students with low standup scores`
    );

    await prisma.$disconnect();
    console.log('\n✨ All database tests passed!\n');
  } catch (error: any) {
    console.error('\n❌ Database test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   Cannot connect to database. Ensure it\'s running.');
    } else if (error.message.includes('authentication')) {
      console.error('   Database authentication failed. Check DATABASE_URL.');
    }
    process.exit(1);
  }
}

async function runAllTests() {
  try {
    await testSlackChannelLookup();
    await testDatabaseAccess();
    console.log('✨ All tests completed!\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runAllTests();
