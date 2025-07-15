import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { getSlackClientForEvent } from "./getSlackClientForEvent";
import { UsersListResponse } from "@slack/web-api";
import { Member } from "@slack/web-api/dist/response/UsersListResponse";
import { SlackEventWithProjects, SlackMentorInfo, SlackStudentInfo } from "./types";
import { makeDebug } from '../utils';

const DEBUG = makeDebug('slack:linkExistingSlackMembers');

export async function linkExistingSlackMembers(
  event: SlackEventWithProjects<SlackStudentInfo & SlackMentorInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  const searchStudents = Object.fromEntries(
    event.projects
      .flatMap(p => p.students)
      .filter(s => !s.slackId)
      .map(s => [s.email, s])
  );

  const searchMentors = Object.fromEntries(
    event.projects
      .flatMap(p => p.mentors)
      .filter(s => !s.slackId)
      .map(s => [s.email, s])
  );

  const previousStudents = await prisma.student.findMany({
    where: { slackId: { not: null }, email: { in: Object.keys(searchStudents) } },
    select: { email: true, slackId: true},
  });

  const previousMentors = await prisma.mentor.findMany({
    where: { slackId: { not: null }, email: { in: Object.keys(searchMentors) } },
    select: { email: true, slackId: true},
  });

  for (const pStudent of previousStudents) {
    if (pStudent.email in searchStudents) {
      await prisma.student.update({
        where: { id: searchStudents[pStudent.email].id },
        data: { slackId: pStudent.slackId },
      });
      delete searchStudents[pStudent.email];
    }
  }

  for (const pMentor of previousMentors) {
    if (pMentor.email in searchMentors) {
      await prisma.mentor.update({
        where: { id: searchMentors[pMentor.email].id },
        data: { slackId: pMentor.slackId },
      });
      delete searchMentors[pMentor.email];
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
    .filter(m => m.profile?.email && m.profile.email in searchStudents);
  const matchingMentors = allMembers
    .filter(m => m.profile?.email && m.profile.email in searchMentors);

  DEBUG(`${matchingStudents.length} students, ${matchingMentors.length} mentors matched to Slack.`);

  for (const member of matchingStudents) {
    await prisma.student.updateMany({
      where: { id: searchStudents[member.profile!.email!].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      DEBUG(`Warning, user ${member.profile!.email} is deactivated.`);
    }
  }

  for (const member of matchingMentors) {
    const result = await prisma.mentor.updateMany({
      where: { id: searchMentors[member.profile!.email!].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      DEBUG(`Warning, user ${member.profile!.email} is deactivated.`);
    }
  }
}