import { Container } from 'typedi';
import { Event, Mentor, PrismaClient, Student, Project, ProjectStatus, MentorStatus, StudentStatus } from '@prisma/client';
import { ConversationsListResponse, UsersListResponse, WebClient, retryPolicies } from '@slack/web-api';
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { PickNonNullable } from '../utils';
import { Member } from '@slack/web-api/dist/response/UsersListResponse';
import { getSlackClientForEvent } from './getSlackClientForEvent';
import { projectToSlackChannelName } from './projectToSlackChannelName';
import { eventToChannelName } from './eventToChannelName';

type MentorInfo = { mentors: Pick<Mentor, 'givenName' | 'surname'>[] };
type StudentInfo = { students: Pick<Student, 'id' | 'email' | 'slackId'>[] };

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

export async function linkExistingSlackMembers(
  event: SlackEventWithProjects<StudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  const searchMembers = Object.fromEntries(
    event.projects
      .flatMap(p => p.students)
      .map(s => [s.email, s])
  );

  const allMembers = await slack.paginate(
    'users.list',
    {},
    (p: UsersListResponse) => !p.response_metadata?.next_cursor,
    (accum: Member[] | undefined, page: UsersListResponse) => [
      ...(accum || []),
      ...(page.members || [])
    ],
  );

  const matchingMembers = allMembers
    .filter(m => m.profile?.email && m.profile.email in searchMembers);

  for (const member of matchingMembers) {
    await prisma.student.updateMany({
      where: { id: searchMembers[member.profile!.email!].id },
      data: { slackId: member.id! },
    });

    if (member.deleted) {
      console.warn(`User ${member.profile!.email} is deactivated.`);
    }
  }
}

export async function linkExistingSlackChannels(
  event: SlackEventWithProjects<MentorInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  const searchChannels = Object.fromEntries(
    event.projects
      .filter(p => !p.slackChannelId)
      .map(p => [projectToSlackChannelName(p), p.id]),
  );

  const allChannels = await slack.paginate(
    'conversations.list',
    { exclude_archived: true },
    (p: ConversationsListResponse) => !p.response_metadata?.next_cursor,
    (accum: Channel[] | undefined, page: ConversationsListResponse) => [
      ...(accum || []),
      ...(page.channels || [])
    ],
  );

  const matchingChannels = allChannels
    .filter(c => c.name_normalized && c.name_normalized in searchChannels);

  // Link each existing channel to projects
  for (const channel of matchingChannels) {
    await prisma.project.updateMany({
      where: { id: searchChannels[channel.name_normalized!] },
      data: { slackChannelId: channel.id },
    });
  }
}

export async function updateSlackUserGroups(
  event: SlackEventWithProjects<StudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);
  if (!event.slackUserGroupId) {
    const result = await slack.usergroups.create({
      name: event.name,
      handle: eventToChannelName(event),
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { slackUserGroupId: result.usergroup!.id! },
    });
    event.slackUserGroupId = result.usergroup!.id!;
  }

  const ids = event.projects
    .flatMap(p => p.students)
    .filter(s => s.slackId)
    .map(s => s.slackId);

  console.log(`Updating group ${event.slackUserGroupId} with ${ids.length} members.`);
  
  await slack.usergroups.users.update({
    usergroup: event.slackUserGroupId,
    users: ids.join(','),
  });
}

export async function addMissingSlackChannelMembers(
  event: SlackEventWithProjects<{ students: Pick<Student, 'slackId'>[] }>
): Promise<void> {
  const slack = getSlackClientForEvent(event);
  const eligibleProjects = event.projects
    .filter(p => (
      p.slackChannelId
      && (p.students.filter(s => s.slackId).length > 0)
    ));

  for (const project of eligibleProjects) {
    const inviteIds = project.students
      .filter(s => s.slackId)
      .map(s => s.slackId);

    await slack.conversations.invite({
      channel: project.slackChannelId!,
      users: inviteIds.join(','),
    });
  }
}

export async function createSlackChannels(
  event: SlackEventWithProjects<MentorInfo & StudentInfo>
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const slack = getSlackClientForEvent(event);

  for (const project of event.projects.filter(p => !p.slackChannelId)) {
    let id = null;
    let number = 0;
    while(!id && number < 3) {
      const name = projectToSlackChannelName(project)
        + (number === 0 ? '' : `-${number}`);
      console.log(`Attempting to create channel ${name}...`);
      try {
        const result = await slack.conversations.create(
          { is_private: false, name }
        );
        if (!result.ok || !result.channel?.id) throw Error();
        id = result.channel.id;
      } catch(ex) {}
      number++;
    }

    if (!id) continue;
    console.log(`... channel created!`);
    
    await prisma.project.update({
      where: { id },
      data: { slackChannelId: id },
    });

    const inviteIds = project.students
      .filter(s => s.slackId)
      .map(s => s.slackId);

    if (inviteIds.length > 0) {
      console.log(`Inviting ${inviteIds.length} students.`);
      await slack.conversations.invite({
        channel: id,
        users: inviteIds.join(','),
      });
    }
  }
}

export async function archiveSlackChannels(
  event: SlackEventWithProjects<{}>
): Promise<void> {
  const slack = getSlackClientForEvent(event);
  const archiveExtension = eventToChannelName(event);

  for (const project of event.projects.filter(p => p.slackChannelId)) {
    const slackChannel = await slack.conversations.info(
      { channel: project.slackChannelId! }
    );
    if (!slackChannel.ok || !slackChannel.channel?.name_normalized) return;

    const archivedName = slackChannel.channel.name_normalized
      + '-' + archiveExtension;

    console.log(`Archiving ${slackChannel.channel.name_normalized} as ${archivedName}`);

    await slack.conversations.rename({
      channel: project.slackChannelId!,
      name: archivedName,
    });

    await slack.conversations.archive({
      channel: project.slackChannelId!
    });
  }
}

export async function syncSlack(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const activeEvents = await prisma.event.findMany({
      where: {
        isActive: true,
        slackWorkspaceAccessToken: { not: null },
        slackWorkspaceId: { not: null },
      },
      select: slackEventInfoSelect,
    }) as SlackEventWithProjects<MentorInfo & StudentInfo>[];

  for (const event of activeEvents) {
    try {
      await linkExistingSlackMembers(event);
      await linkExistingSlackChannels(event);
      await updateSlackUserGroups(event);
    } catch (ex) {
      console.error(ex);
    }
  }
}