/**
 * Manual test script for the weekly standup report Slack integration
 * 
 * This script allows you to test the Slack message formatting and posting
 * without waiting for Monday or affecting real students.
 * 
 * Usage:
 *   # Dry run - preview message without posting
 *   npx ts-node scripts/testWeeklyStandupReport.ts --dry-run
 * 
 *   # Post to a test channel
 *   npx ts-node scripts/testWeeklyStandupReport.ts --channel=test-notifications
 * 
 *   # Post to #stats with fake data
 *   npx ts-node scripts/testWeeklyStandupReport.ts --channel=stats
 * 
 *   # Use real data from the database
 *   npx ts-node scripts/testWeeklyStandupReport.ts --channel=test-notifications --use-real-data
 */

import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { WebClient } from '@slack/web-api';
import { DateTime } from 'luxon';
import { formatStudentList } from '../src/automation/tasks/weeklyLowStandupReport';
import { registerDi } from '../src/di';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const useRealData = args.includes('--use-real-data');
const channelArg = args.find(arg => arg.startsWith('--channel='));
const channelName = channelArg ? channelArg.split('=')[1] : 'stats';

interface TestStudent {
  studentId: string;
  givenName: string;
  surname: string;
  slackId: string | null;
  assignedMentors: {
    givenName: string;
    surname: string;
    slackId: string | null;
  }[];
  eventName: string;
  consecutiveLowScores: number;
  lastTwoRatings: (number | null)[];
}

// Fake test data
const FAKE_STUDENTS: TestStudent[] = [
  {
    studentId: 'test-1',
    givenName: 'Alice',
    surname: 'TestStudent',
    slackId: null, // No Slack ID to avoid pinging
    assignedMentors: [{
      givenName: 'Morgan',
      surname: 'Lee',
      slackId: null,
    }],
    eventName: 'CodeDay Labs Test',
    consecutiveLowScores: 2,
    lastTwoRatings: [1, 1],
  },
  {
    studentId: 'test-2',
    givenName: 'Bob',
    surname: 'DemoUser',
    slackId: null,
    assignedMentors: [{
      givenName: 'Riley',
      surname: 'Park',
      slackId: null,
    }],
    eventName: 'CodeDay Labs Test',
    consecutiveLowScores: 2,
    lastTwoRatings: [0, 1],
  },
  {
    studentId: 'test-3',
    givenName: 'Charlie',
    surname: 'SampleStudent',
    slackId: null,
    assignedMentors: [],
    eventName: 'CodeDay Labs Test',
    consecutiveLowScores: 2,
    lastTwoRatings: [1, 0],
  },
];

async function postTestMessage(
  slack: WebClient | null,
  channelName: string,
  students: TestStudent[],
  eventName: string
): Promise<void> {
  const studentList = formatStudentList(students);

  const message = {
    channel: channelName,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Weekly Low Standup Report [TEST]',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Event:* ${eventName}\n*Report Date:* ${DateTime.now().toLocaleString(DateTime.DATE_FULL)}\n*Mode:* ${useRealData ? 'Real Data' : 'Fake Test Data'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `The following students had *two consecutive standup scores under 2* in the previous week:\n\n${studentList}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Total flagged students: ${students.length} | This is a TEST message`,
          },
        ],
      },
    ],
  };

  if (isDryRun) {
    console.log('\n📋 DRY RUN - Message preview:');
    console.log(JSON.stringify(message, null, 2));
    console.log('\n✅ Dry run complete - no message posted');
    return;
  }

  if (!slack) {
    throw new Error('Slack client is required for live posting.');
  }

  const channelsList = await slack.conversations.list({
    exclude_archived: true,
    types: 'public_channel,private_channel',
  });

  const channel = channelsList.channels?.find(
    (c: any) => c.name === channelName
  );

  if (!channel) {
    console.error(`❌ Channel #${channelName} not found.`);
    console.log('\nAvailable channels:');
    channelsList.channels?.slice(0, 10).forEach((c: any) => {
      console.log(`  - #${c.name} (${c.id})`);
    });
    return;
  }

  console.log(`✅ Found channel #${channelName} (${channel.id})`);

  await slack.chat.postMessage({
    ...message,
    channel: channel.id!,
  });
  console.log(`\n✅ Test message posted to #${channelName}`);
}

async function main() {
  console.log('🧪 Weekly Standup Report - Test Script\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Channel: #${channelName}`);
  console.log(`Data: ${useRealData ? 'Real from database' : 'Fake test data'}\n`);

  let students: TestStudent[];
  let eventName: string;

  if (useRealData) {
    // TODO: Implement real data fetching
    console.log('⚠️  Real data mode not yet implemented, using fake data');
    students = FAKE_STUDENTS;
    eventName = 'CodeDay Labs Test';
  } else {
    students = FAKE_STUDENTS;
    eventName = 'CodeDay Labs Test';
  }

  if (isDryRun) {
    await postTestMessage(null, channelName, students, eventName);
    return;
  }

  registerDi();
  const prisma = Container.get(PrismaClient);

  try {
    const event = await prisma.event.findFirst({
      where: {
        isActive: true,
        slackWorkspaceAccessToken: { not: null },
        slackWorkspaceId: { not: null },
      },
    });

    if (!event) {
      console.error('❌ No active event with Slack integration found');
      process.exit(1);
    }

    console.log(`Using event: ${event.name} (${event.id})\n`);

    // Create Slack client
    const slack = new WebClient(event.slackWorkspaceAccessToken!, {
      teamId: event.slackWorkspaceId!,
    });

    await postTestMessage(slack, channelName, students, eventName);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✨ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

