import Container, { Service, Inject } from 'typedi';
import { Resolver, Query, Ctx, Arg, Mutation, Authorized } from 'type-graphql';
import { AuthRole, Context } from '../context';
import { SupportTicketType } from '../enums';
import { LinearClient } from '@linear/sdk';
import { Mentor, PersonType, PrismaClient, Student } from '@prisma/client';
import { createHash } from 'crypto';
import { idOrUsernameOrAuthToUniqueWhere } from '../utils';
import config from '../config';

function supportTicketTypeToTitle(type: SupportTicketType) {
  switch (type) {
    case SupportTicketType.IssueSolved:
      return 'Solved Issue';
    case SupportTicketType.IssueCantReplicate:
      return 'Can\'t Replicate';
    case SupportTicketType.MaintainerUnsupportive:
      return 'Maintainer Issue';
    case SupportTicketType.MentorUnresponsive:
      return 'Unresponsive Mentor';
    case SupportTicketType.Other:
      return 'Other';
  }
}

function name(person: Student | Mentor) {
  return person.givenName + ' ' + person.surname;
}

@Service()
@Resolver(Boolean)
export class SupportTicketResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.STUDENT, AuthRole.MENTOR)
  @Mutation(() => Boolean)
  async createSupportTicket(
    @Ctx() { auth }: Context,
    @Arg('projectId', () => String) projectId: string,
    @Arg('type', () => SupportTicketType) type: SupportTicketType,
    @Arg('description', () => String, { nullable: true }) description?: string,
  ): Promise<boolean> {
    const linear = Container.get(LinearClient);
    const personType = auth.personType === PersonType.STUDENT ? 'Student' : 'Mentor';
    const person = auth.personType === PersonType.STUDENT
      ? (await this.prisma.student.findUnique({ where: idOrUsernameOrAuthToUniqueWhere(auth), rejectOnNotFound: true }))
      : (await this.prisma.mentor.findUnique({ where: idOrUsernameOrAuthToUniqueWhere(auth), rejectOnNotFound: true }));

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...(auth.personType === PersonType.STUDENT
          ? { students: { some: { id: auth.id } } }
          : { mentors: { some: { id: auth.id } } }),
      },
      rejectOnNotFound: true,
      include: {
        students: true,
        mentors: true,
        event: true,
      },
    });

    const searchLabel = createHash('sha256').update(`${project.id},${type}`).digest('hex').slice(0, 16);
    const issues = await linear.issues({ filter: { team: { id: { eq: config.linear.teamId } }, description: { contains: searchLabel }, state: { type: { in: ['backlog', 'unstarted', 'started'] } } } });

    if (issues.nodes.length > 0) {
      throw new Error(`There is already an open support ticket for that.`);
    }

    await linear.createIssue({
      priority: 2,
      labelIds: [config.linear.problemLabelId],
      teamId: config.linear.teamId,
      title: `${supportTicketTypeToTitle(type)} for ${project.mentors.map(name).join(', ')}`,
      description: `[${searchLabel}]\nSession: ${project.event?.name || 'N/A'}\nMentor: ${project.mentors.map(name).join(', ')}\nStudents: ${project.students.map(name).join(', ')}\nSlack Link: https://codedayorg.slack.com/archives/${project.slackChannelId}\nReported by: ${name(person)}\n\n## Student Problem Description\n${description || 'None provided.'}\n\n## Project Description\n${project.issueUrl}\n${project.description}`,
    });

    return true;
  }
}
