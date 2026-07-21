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
import { PrismaClient, MentorStatus, ProjectStatus, StudentStatus, Track } from '@prisma/client';
import Container from 'typedi';
import { WebClient } from '@slack/web-api';
import { DateTime } from 'luxon';
import { formatStudentList, getFlaggedStudentsForEvent } from '../src/automation/tasks/weeklyLowStandupReport';
import { registerDi } from '../src/di';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const useRealData = args.includes('--use-real-data');
const seedTestData = args.includes('--seed-test-data');
const channelArg = args.find(arg => arg.startsWith('--channel='));
const channelName = channelArg ? channelArg.split('=')[1] : 'all-codeday-testing';

const TEST_EVENT_ID = 'weekly-standup-report-test-event';
const TEST_EVENT_NAME = 'Weekly Standup Report Test Event';
const TEST_SLACK_BOT_TOKEN = process.env.TEST_SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN || null;

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

async function seedLocalTestData(prisma: PrismaClient): Promise<{ eventId: string; eventName: string; hasSlackToken: boolean }> {
  const now = DateTime.now();
  let slackWorkspaceId: string | null = null;

  if (TEST_SLACK_BOT_TOKEN) {
    const slack = new WebClient(TEST_SLACK_BOT_TOKEN);
    const auth = await slack.auth.test();
    slackWorkspaceId = auth.team_id || null;
  }

  await prisma.standupResult.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.standupThread.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.project.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.student.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.mentor.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.event.deleteMany({ where: { id: TEST_EVENT_ID } });

  await prisma.event.create({
    data: {
      id: TEST_EVENT_ID,
      name: TEST_EVENT_NAME,
      title: TEST_EVENT_NAME,
      certificationStatements: [],
      studentApplicationsStartAt: now.minus({ days: 30 }).toJSDate(),
      mentorApplicationsStartAt: now.minus({ days: 30 }).toJSDate(),
      studentApplicationsEndAt: now.minus({ days: 20 }).toJSDate(),
      mentorApplicationsEndAt: now.minus({ days: 20 }).toJSDate(),
      startsAt: now.minus({ days: 14 }).toJSDate(),
      projectWorkStartsAt: now.minus({ days: 10 }).toJSDate(),
      studentApplicationSchema: {},
      studentApplicationUi: {},
      studentApplicationPostprocess: {},
      mentorApplicationSchema: {},
      mentorApplicationUi: {},
      mentorApplicationPostprocess: {},
      isActive: true,
      slackWorkspaceAccessToken: TEST_SLACK_BOT_TOKEN,
      slackWorkspaceId,
    },
  });

  await prisma.mentor.createMany({
    data: [
      {
        id: 'test-mentor-1',
        eventId: TEST_EVENT_ID,
        givenName: 'Morgan',
        surname: 'Lee',
        email: 'morgan.lee@example.test',
        profile: {},
        status: MentorStatus.ACCEPTED,
      },
      {
        id: 'test-mentor-2',
        eventId: TEST_EVENT_ID,
        givenName: 'Riley',
        surname: 'Park',
        email: 'riley.park@example.test',
        profile: {},
        status: MentorStatus.ACCEPTED,
      },
    ],
  });

  await prisma.student.createMany({
    data: [
      {
        id: 'test-student-1',
        eventId: TEST_EVENT_ID,
        givenName: 'Alice',
        surname: 'TestStudent',
        email: 'alice.teststudent@example.test',
        profile: {},
        track: Track.BEGINNER,
        status: StudentStatus.ACCEPTED,
        minHours: 5,
      },
      {
        id: 'test-student-2',
        eventId: TEST_EVENT_ID,
        givenName: 'Bob',
        surname: 'DemoUser',
        email: 'bob.demouser@example.test',
        profile: {},
        track: Track.BEGINNER,
        status: StudentStatus.ACCEPTED,
        minHours: 5,
      },
      {
        id: 'test-student-3',
        eventId: TEST_EVENT_ID,
        givenName: 'Charlie',
        surname: 'SampleStudent',
        email: 'charlie.samplestudent@example.test',
        profile: {},
        track: Track.BEGINNER,
        status: StudentStatus.ACCEPTED,
        minHours: 5,
      },
    ],
  });

  await prisma.project.create({
    data: {
      id: 'test-project-1',
      eventId: TEST_EVENT_ID,
      description: 'Mentored project for weekly report testing',
      deliverables: 'Weekly standups',
      track: Track.BEGINNER,
      status: ProjectStatus.MATCHED,
      mentors: {
        connect: [{ id: 'test-mentor-1' }, { id: 'test-mentor-2' }],
      },
      students: {
        connect: [{ id: 'test-student-1' }, { id: 'test-student-2' }],
      },
    },
  });

  await prisma.project.create({
    data: {
      id: 'test-project-2',
      eventId: TEST_EVENT_ID,
      description: 'Unassigned project for weekly report testing',
      deliverables: 'Weekly standups',
      track: Track.BEGINNER,
      status: ProjectStatus.MATCHED,
      students: {
        connect: [{ id: 'test-student-3' }],
      },
    },
  });

  await prisma.standupThread.createMany({
    data: [
      {
        id: 'test-standup-thread-1',
        dueAt: now.startOf('day').minus({ days: 6 }).toJSDate(),
        projectId: 'test-project-1',
        eventId: TEST_EVENT_ID,
      },
      {
        id: 'test-standup-thread-2',
        dueAt: now.startOf('day').minus({ days: 3 }).toJSDate(),
        projectId: 'test-project-1',
        eventId: TEST_EVENT_ID,
      },
      {
        id: 'test-standup-thread-3',
        dueAt: now.startOf('day').minus({ days: 5 }).toJSDate(),
        projectId: 'test-project-2',
        eventId: TEST_EVENT_ID,
      },
      {
        id: 'test-standup-thread-4',
        dueAt: now.startOf('day').minus({ days: 2 }).toJSDate(),
        projectId: 'test-project-2',
        eventId: TEST_EVENT_ID,
      },
    ],
  });

  await prisma.standupResult.createMany({
    data: [
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-1',
        studentId: 'test-student-1',
        threadId: 'test-standup-thread-1',
        text: 'Low rating test standup 1',
        rating: 1,
      },
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-1',
        studentId: 'test-student-1',
        threadId: 'test-standup-thread-2',
        text: 'Low rating test standup 2',
        rating: 1,
      },
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-1',
        studentId: 'test-student-2',
        threadId: 'test-standup-thread-1',
        text: 'Low rating test standup 3',
        rating: 0,
      },
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-1',
        studentId: 'test-student-2',
        threadId: 'test-standup-thread-2',
        text: 'Low rating test standup 4',
        rating: 1,
      },
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-2',
        studentId: 'test-student-3',
        threadId: 'test-standup-thread-3',
        text: 'Low rating test standup 5',
        rating: 1,
      },
      {
        eventId: TEST_EVENT_ID,
        projectId: 'test-project-2',
        studentId: 'test-student-3',
        threadId: 'test-standup-thread-4',
        text: 'Low rating test standup 6',
        rating: 0,
      },
    ],
  });

  return {
    eventId: TEST_EVENT_ID,
    eventName: TEST_EVENT_NAME,
    hasSlackToken: Boolean(TEST_SLACK_BOT_TOKEN && slackWorkspaceId),
  };
}

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

  registerDi();
  const prisma = Container.get(PrismaClient);

  try {
    let seededEventInfo: { eventId: string; eventName: string; hasSlackToken: boolean } | null = null;
    if (seedTestData) {
      console.log('Seeding local weekly report test data...');
      seededEventInfo = await seedLocalTestData(prisma);
      console.log(`✅ Seeded event: ${seededEventInfo.eventName} (${seededEventInfo.eventId})`);
      if (!seededEventInfo.hasSlackToken) {
        console.log('⚠️  Seeded DB data, but no test Slack bot token was found. Live posting will still require TEST_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN.');
      }
    }

    if (useRealData) {
      const sourceEvent = seededEventInfo
        ? await prisma.event.findUnique({ where: { id: seededEventInfo.eventId } })
        : await prisma.event.findFirst({
          where: {
            isActive: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        });

      if (!sourceEvent) {
        console.error('❌ No event found to pull report data from. Seed data first with --seed-test-data.');
        process.exit(1);
      }

      eventName = sourceEvent.name;
      students = await getFlaggedStudentsForEvent(prisma, sourceEvent.id, sourceEvent.name);
      console.log(`Using event data: ${sourceEvent.name} (${sourceEvent.id})`);
      console.log(`Found ${students.length} flagged students in local DB\n`);
    } else {
      students = FAKE_STUDENTS;
      eventName = 'CodeDay Labs Test';
    }

    if (isDryRun) {
      await postTestMessage(null, channelName, students, eventName);
      return;
    }

    const event = seededEventInfo
      ? await prisma.event.findUnique({ where: { id: seededEventInfo.eventId } })
      : await prisma.event.findFirst({
        where: {
          isActive: true,
          slackWorkspaceAccessToken: { not: null },
          slackWorkspaceId: { not: null },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

    if (!event?.slackWorkspaceAccessToken || !event.slackWorkspaceId) {
      console.error('❌ No active event with Slack workspace token found. Seed a test event with TEST_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN.');
      process.exit(1);
    }

    console.log(`Using Slack event: ${event.name} (${event.id})\n`);

    const slack = new WebClient(event.slackWorkspaceAccessToken, {
      teamId: event.slackWorkspaceId,
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

