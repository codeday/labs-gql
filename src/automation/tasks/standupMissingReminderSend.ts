import { PrismaClient, StudentStatus, ProjectStatus } from "@prisma/client";
import Container from "typedi";
import { canSendSlackProjectMessage, sendSlackProjectMessage } from "../../slack";
import shuffle from 'knuth-shuffle-seeded';
import { sendTemplateEmail } from "../../email";
import { makeDebug } from '../../utils';
import { DateTime } from "luxon";
import { Transporter } from "nodemailer";

const DEBUG = makeDebug('automation:tasks:standupMissingReminderSend');

export const JOBSPEC = '*/5 * * * *';

const MISSING_STANDUP_SLACK_MESSAGES = [
  'It looks like you missed this standup. As a reminder, the standups are required.',
  'Reminder that standups are required.',
  'You did not complete the required standup.',
  'Please make sure to complete all the standups.',
  'As a reminder, standups are required.',
];

export default async function standupMissingReminderSend() {
  const prisma = Container.get(PrismaClient);
  const standups = await prisma.standupThread.findMany({
    where: {
      event: {
        isActive: true,
      },
      project: { status: ProjectStatus.MATCHED },
      dueAt: { lte: DateTime.now().minus({ minutes: 30 }).toJSDate() },
      OR: [
        { sentMissingReminderSlack: false },
        { sentMissingReminderEmail: false },
      ],
    },
    include: {
      results: { select: { student: { select: { id: true } } } },
      project: {
        select: {
          students: {
            where: { status: StudentStatus.ACCEPTED },
            select: {
              id: true,
              slackId: true,
              email: true,
              givenName: true,
              weeks: true,
              minHours: true,
              event: { select: { id: true, name: true, emailSignature: true, title: true, defaultWeeks: true, startsAt: true } },
            }
          },
          slackChannelId: true,
          event: {
            select: { slackWorkspaceAccessToken: true, slackWorkspaceId: true, name: true, startsAt: true },
          },
        }
      },
    },
  });

  const randomSlackMessage = shuffle(MISSING_STANDUP_SLACK_MESSAGES)[0];

  for (const standup of standups) {
    const weeksSinceStart = Math.abs(
      DateTime
      .fromJSDate(standup.dueAt)
      .diff(DateTime.fromJSDate(standup.project.event!.startsAt), 'weeks')
      .weeks
    );

    const presentStudentIds = new Set(standup.results.map(r => r.student.id));
    const missingStudents = standup.project.students.filter(s => (
      !presentStudentIds.has(s.id)
      && s.weeks > weeksSinceStart
    ));

    DEBUG(`Sending missing standup reminders to ${missingStudents.length} for ${standup.id} (project: ${standup.projectId})`)
    await prisma.standupThread.update({
      where: { id: standup.id },
      data: { sentMissingReminderSlack: true, sentMissingReminderEmail: true },
    });

    if (missingStudents.length === 0) continue;

    // Send email reminders
    if (!standup.sentMissingReminderEmail) {
      try {
        await sendTemplateEmail(
          'standupMissingReminder',
          {  standup, weeksSinceStart },
          `Missing ${standup.project.event?.name || ''} Standup for ${DateTime.fromJSDate(standup.dueAt).toFormat('yyyy-MM-dd')}`,
          missingStudents
        );
      } catch (ex) {
        DEBUG(ex);
      }
    }

    // Send Slack reminders
    if (!standup.sentMissingReminderSlack) {
      const missingStudentsWithConnectedSlack = missingStudents.filter(s => !!s.slackId);
      DEBUG(`Sending Slack reminders to ${missingStudentsWithConnectedSlack.length} students for ${standup.id}`);
      if (canSendSlackProjectMessage(standup.project) && missingStudentsWithConnectedSlack.length > 0) {
        await sendSlackProjectMessage(
          standup.project,
          `${missingStudentsWithConnectedSlack.map(s => `<@${s.slackId}>`).join(' ')} ${randomSlackMessage}`
        );
      }

    }
  }
}
