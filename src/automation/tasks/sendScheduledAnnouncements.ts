import { Mentor, PrismaClient, Project, ScheduledAnnouncementMedium, ScheduledAnnouncementTarget, Student } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "../../slack";
import { makeDebug } from "../../utils";
import { DateTime } from "luxon";
import { Transporter } from "nodemailer";
import config from "../../config";

const DEBUG = makeDebug('automation:tasks:sendScheduledAnnouncements');

export const JOBSPEC = '*/5 * * * *';

export default async function sendScheduledAnnouncements(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  
  // Find all scheduled announcements that are due to be sent
  const now = DateTime.now().toJSDate();
  const dueAnnouncements = await prisma.scheduledAnnouncement.findMany({
    where: {
      sendAt: { lte: now },
      isSent: false,
      event: {
        isActive: true,
      },
    },
    include: {
      event: {
        include: {
          mentors: {
            where: { status: 'ACCEPTED' },
            select: { id: true, email: true, givenName: true, surname: true, slackId: true },
          },
          students: {
            where: { status: 'ACCEPTED' },
            select: { id: true, email: true, givenName: true, surname: true, slackId: true },
          },
          projects: {
            where: { status: 'MATCHED' },
            include: {
              mentors: {
                where: { status: 'ACCEPTED' },
                select: { id: true, email: true, givenName: true, surname: true, slackId: true, managerUsername: true },
              },
              students: {
                where: { status: 'ACCEPTED' },
                select: { id: true, email: true, givenName: true, surname: true, slackId: true },
              },
            },
          },
        },
      },
    },
  });

  DEBUG(`Found ${dueAnnouncements.length} scheduled announcements to send.`);

  for (const announcement of dueAnnouncements) {
    try {
      DEBUG(`Processing announcement ${announcement.id}: ${announcement.subject}`);

      if (announcement.medium === ScheduledAnnouncementMedium.EMAIL) {
        await sendEmailAnnouncement(announcement);
      } else if (announcement.medium === ScheduledAnnouncementMedium.SLACK) {
        await sendSlackAnnouncement(announcement);
      }

      // Mark as sent
      await prisma.scheduledAnnouncement.update({
        where: { id: announcement.id },
        data: { isSent: true },
      });

      DEBUG(`Successfully sent announcement ${announcement.id}`);
    } catch (error) {
      DEBUG(`Failed to send announcement ${announcement.id}:`, error);
    }
  }
}

async function sendEmailAnnouncement(announcement: any): Promise<void> {
  const email = Container.get<Transporter>('email');
  const { event, target, subject, body } = announcement;
  let recipients: { To: string[], Cc: string[] }[] = [];

  switch (target) {
    case ScheduledAnnouncementTarget.MENTOR:
      recipients = event.mentors.map((m: Mentor) => ({ To: m.email, Cc: [] }));
      break;
    case ScheduledAnnouncementTarget.STUDENT:
      recipients = event.students.map((s: Student) => ({ To: s.email, Cc: [] }));
      break;
    case ScheduledAnnouncementTarget.TEAM:
        recipients = event.projects.map((p: Project & { mentors: Mentor[], students: Student[] }) => ({
            To: [...p.mentors.map((m: Mentor) => m.email), ...p.students.map((s: Student) => s.email)],
            Cc: [...new Set(p.mentors.map((m: Mentor) => m.managerUsername)).values()]
        }))
      break;
  }

  for (const toSend of recipients) {
    try {
        DEBUG(`Sending announcement ${announcement.id} to [${toSend.To.join(', ')}] cc [${toSend.Cc.join(', ')}]`);
        await email.sendMail({
            from: config.email.from,
            to: toSend.To,
            cc: toSend.Cc,
            subject,
            html: body,
        });
    } catch (ex) {
        DEBUG(ex);
    }
  }
}

async function sendSlackAnnouncement(announcement: any): Promise<void> {
  const { event, target, subject, body } = announcement;

  // Check if event has Slack integration
  if (!event.slackWorkspaceAccessToken || !event.slackWorkspaceId) {
    DEBUG(`Event ${event.id} does not have Slack integration configured`);
    return;
  }

  const slack = getSlackClientForEvent(event);
  const message = `${subject ? `**${subject}**\n\n` : ''}${body}`;

  switch (target) {
    case ScheduledAnnouncementTarget.MENTOR:
      if (event.slackMentorChannelId) {
        DEBUG(`Sending Slack message to mentor channel: ${event.slackMentorChannelId}`);
        await slack.chat.postMessage({
          channel: event.slackMentorChannelId,
          text: message + '<!channel>',
        });
      } else {
        throw new Error(`No mentor channel configured for event ${event.id}`);
      }
      break;

    case ScheduledAnnouncementTarget.STUDENT:
      if (event.slackAnnouncementChannelId) {
        DEBUG(`Sending Slack message to announcement channel: ${event.slackAnnouncementChannelId}`);
        await slack.chat.postMessage({
          channel: event.slackAnnouncementChannelId,
          text: message + (event.slackUserGroupId ? `\n\n<!subteam^${event.slackUserGroupId}>` : ''),
        });
      } else {
        throw new Error(`No announcement channel configured for event ${event.id}, target: ${target}`);
      }
      break;
    case ScheduledAnnouncementTarget.TEAM:
        for (const project of event.projects) {
            DEBUG(`Sending Slack message to project channel: ${project.slackChannelId}`);
            await slack.chat.postMessage({
                channel: project.slackChannelId,
                text: message + '<!channel>',
            });
        }
        break;
  }
}
