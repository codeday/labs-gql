import { PrismaClient, StudentStatus } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "../../slack";
import { makeDebug } from "../../utils";
import { DateTime } from "luxon";
import { WebClient } from "@slack/web-api";

const DEBUG = makeDebug('automation:tasks:weeklyLowStandupReport');

// Run every Monday at 9 AM Pacific Time
export const JOBSPEC = '0 9 * * 1';

interface StudentWithLowStandups {
  studentId: string;
  givenName: string;
  surname: string;
  slackId: string | null;
  eventName: string;
  consecutiveLowScores: number;
  lastTwoRatings: (number | null)[];
}

export default async function weeklyLowStandupReport(): Promise<void> {
  const prisma = Container.get(PrismaClient);

  DEBUG('Starting weekly low standup report...');

  // Get all active events with Slack integration
  const events = await prisma.event.findMany({
    where: {
      isActive: true,
      slackWorkspaceAccessToken: { not: null },
      slackWorkspaceId: { not: null },
    },
    select: {
      id: true,
      name: true,
      slackWorkspaceAccessToken: true,
      slackWorkspaceId: true,
    },
  });

  DEBUG(`Found ${events.length} active events with Slack integration.`);

  for (const event of events) {
    try {
      await sendReportForEvent(event);
    } catch (ex) {
      DEBUG(`Error sending report for event ${event.id}:`, ex);
    }
  }

  DEBUG('Weekly low standup report completed.');
}

async function sendReportForEvent(event: {
  id: string;
  name: string;
  slackWorkspaceAccessToken: string;
  slackWorkspaceId: string;
}): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  // Calculate date range for "previous week" (last 7 days from start of today)
  const now = DateTime.now();
  const startOfToday = now.startOf('day');
  const oneWeekAgo = startOfToday.minus({ days: 7 });

  DEBUG(`Checking standups from ${oneWeekAgo.toISO()} to ${startOfToday.toISO()} for event ${event.id}`);

  // Get all students in the active event
  const students = await prisma.student.findMany({
    where: {
      eventId: event.id,
      status: StudentStatus.ACCEPTED,
    },
    select: {
      id: true,
      givenName: true,
      surname: true,
      slackId: true,
      standupResults: {
        where: {
          thread: {
            dueAt: {
              gte: oneWeekAgo.toJSDate(),
              lt: startOfToday.toJSDate(),
            },
          },
        },
        select: {
          rating: true,
          threadId: true,
          thread: {
            select: {
              dueAt: true,
            },
          },
        },
        orderBy: {
          thread: {
            dueAt: 'asc',
          },
        },
      },
    },
  });

  DEBUG(`Found ${students.length} accepted students in event ${event.id}`);

  // Filter students with two consecutive standup scores < 2
  const flaggedStudents: StudentWithLowStandups[] = [];

  for (const student of students) {
    const ratings = student.standupResults.map(r => r.rating);
    
    if (ratings.length < 2) continue;

    // Check for two consecutive ratings both < 2
    for (let i = 0; i < ratings.length - 1; i++) {
      const current = ratings[i];
      const next = ratings[i + 1];
      
      if (current !== null && next !== null && current < 2 && next < 2) {
        flaggedStudents.push({
          studentId: student.id,
          givenName: student.givenName,
          surname: student.surname,
          slackId: student.slackId,
          eventName: event.name,
          consecutiveLowScores: 2,
          lastTwoRatings: [current, next],
        });
        break; // Only flag once per student
      }
    }
  }

  DEBUG(`Found ${flaggedStudents.length} students with consecutive low standup scores`);

  if (flaggedStudents.length === 0) {
    DEBUG('No students to report, skipping Slack message.');
    return;
  }

  // Post to #stats channel
  await postToStatsChannel(slack, event.name, flaggedStudents);
}

async function postToStatsChannel(
  slack: WebClient,
  eventName: string,
  students: StudentWithLowStandups[]
): Promise<void> {
  const STATS_CHANNEL_NAME = 'stats';

  DEBUG(`Looking up channel: ${STATS_CHANNEL_NAME}`);

  // Find the stats channel
  try {
    const channelsList = await slack.conversations.list({
      exclude_archived: true,
      types: 'public_channel,private_channel',
    });

    const statsChannel = channelsList.channels?.find(
      (c: any) => c.name === STATS_CHANNEL_NAME
    );

    if (!statsChannel) {
      DEBUG(`Channel #${STATS_CHANNEL_NAME} not found, skipping report.`);
      return;
    }

    DEBUG(`Found channel #${STATS_CHANNEL_NAME} with ID ${statsChannel.id}`);

    // Format the message
    const studentList = students
      .map(s => {
        const slackMention = s.slackId ? `<@${s.slackId}>` : `${s.givenName} ${s.surname}`;
        return `• ${slackMention} (${s.givenName} ${s.surname})`;
      })
      .join('\n');

    const message = {
      channel: statsChannel.id,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Weekly Low Standup Report',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Event:* ${eventName}\n*Report Date:* ${DateTime.now().toLocaleString(DateTime.DATE_FULL)}`,
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
              text: `Total flagged students: ${students.length}`,
            },
          ],
        },
      ],
    };

    await slack.chat.postMessage(message);
    DEBUG(`Successfully posted report to #${STATS_CHANNEL_NAME}`);
  } catch (error) {
    DEBUG(`Error posting to #${STATS_CHANNEL_NAME}:`, error);
    throw error;
  }
}
