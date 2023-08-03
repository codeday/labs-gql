import { Event, Mentor, MentorStatus, Project, ProjectStatus, Student, StudentStatus } from "@prisma/client";
import { PickNonNullable } from "../utils";

export type SlackMentorInfo = { mentors: Pick<Mentor, 'givenName' | 'surname'>[] };
export type SlackStudentInfo = { students: Pick<Student, 'id' | 'email' | 'slackId'>[] };

export type SlackEventWithProjects<T> =
  PickNonNullable<Event, 'slackWorkspaceAccessToken' | 'slackWorkspaceId' | 'name' | 'id'>
  & Pick<Event, 'slackUserGroupId'>
  & { projects: (Pick<Project, 'id' | 'slackChannelId'> & T)[] };

export const slackEventInfoSelect = {
  slackWorkspaceAccessToken: true,
  slackWorkspaceId: true,
  slackUserGroupId: true,
  id: true,
  name: true,
  projects: {
    where: { status: ProjectStatus.MATCHED },
    select: {
      id: true,
      slackChannelId: true,
      mentors: {
        where: { status: MentorStatus.ACCEPTED },
        select: {
          givenName: true,
          surname: true,
        }
      },
      students: {
        where: { status: StudentStatus.ACCEPTED },
        select: {
          id: true,
          email: true,
          slackId: true,
        },
      },
    },
  },
};