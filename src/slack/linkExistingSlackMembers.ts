import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { WebClient, UsersListResponse } from "@slack/web-api";
import { Member } from "@slack/web-api/dist/response/UsersListResponse";
import { SlackEventWithProjects, SlackMentorInfo, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:linkExistingSlackMembers');

export const normalizeEmail = (email: string): string => email.toLowerCase().trim();

export type LinkExistingSlackMembersDeps = {
  prisma?: PrismaClient;
  slack?: Pick<WebClient, 'paginate'>;
};

export async function linkExistingSlackMembers(
  event: SlackEventWithProjects<SlackStudentInfo & SlackMentorInfo>,
  deps: LinkExistingSlackMembersDeps = {},
): Promise<void> {
  const prisma = deps.prisma ?? Container.get(PrismaClient);
  const slack = deps.slack ?? getSlackClientForEvent(event);

  const searchStudents = Object.fromEntries(
    event.projects
      .flatMap(p => p.students)
      .filter(s => !s.slackId)
      .map(s => [normalizeEmail(s.email), s])
  );

  const searchMentors = Object.fromEntries(
    event.projects
      .flatMap(p => p.mentors)
      .filter(s => !s.slackId)
      .map(s => [normalizeEmail(s.email), s])
  );

  const previousStudents = await prisma.student.findMany({
    where: { slackId: { not: null }, email: { in: Object.keys(searchStudents), mode: 'insensitive' } },
    select: { email: true, slackId: true},
  });

  const previousMentors = await prisma.mentor.findMany({
    where: { slackId: { not: null }, email: { in: Object.keys(searchMentors), mode: 'insensitive' } },
    select: { email: true, slackId: true},
  });

  for (const pStudent of previousStudents) {
    const key = normalizeEmail(pStudent.email);
    if (key in searchStudents) {
      await prisma.student.update({
        where: { id: searchStudents[key].id },
        data: { slackId: pStudent.slackId },
      });
      delete searchStudents[key];
    }
  }

  for (const pMentor of previousMentors) {
    const key = normalizeEmail(pMentor.email);
    if (key in searchMentors) {
      await prisma.mentor.update({
        where: { id: searchMentors[key].id },
        data: { slackId: pMentor.slackId },
      });
      delete searchMentors[key];
    }
  }

  const allMembers = await slack.paginate(
    'users.list',
    {},
    (p: UsersListResponse) => !p.response_metadata?.next_cursor,
    (accum: Member[] | undefined, page: UsersListResponse) => [
      ...(accum || []),
      ...(page.members || [])
    ],
  );

  const matchingStudents = allMembers
    .filter(m => m.profile?.email && normalizeEmail(m.profile.email) in searchStudents);
  const matchingMentors = allMembers
    .filter(m => m.profile?.email && normalizeEmail(m.profile.email) in searchMentors);

  DEBUG(`${matchingStudents.length} students, ${matchingMentors.length} mentors matched to Slack.`);

  for (const member of matchingStudents) {
    await prisma.student.updateMany({
      where: { id: searchStudents[normalizeEmail(member.profile!.email!)].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      DEBUG(`Warning, user ${member.profile!.email} is deactivated.`);
    }
  }

  for (const member of matchingMentors) {
    const result = await prisma.mentor.updateMany({
      where: { id: searchMentors[normalizeEmail(member.profile!.email!)].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      DEBUG(`Warning, user ${member.profile!.email} is deactivated.`);
    }
  }
}