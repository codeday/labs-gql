import Container, { Service, Inject } from 'typedi';
import { Resolver, Query, Ctx, Arg, Mutation, Authorized } from 'type-graphql';
import { AuthRole, Context } from '../context';
import { SupportTicketType } from '../enums';
import { LinearClient } from '@linear/sdk';
import { Mentor, PersonType, PrismaClient, Student } from '@prisma/client';
import { createHash } from 'crypto';
import { idOrUsernameOrAuthToUniqueWhere } from '../utils';
import config from '../config';
import { createSupportTicket } from '../linear/createSupportTicket';

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
    @Arg('preventingProgress', () => Boolean, { nullable: true }) preventingProgress?: boolean,
  ): Promise<boolean> {
    const reporter = auth.personType === PersonType.STUDENT
      ? (await this.prisma.student.findUniqueOrThrow({ where: idOrUsernameOrAuthToUniqueWhere(auth) }))
      : (await this.prisma.mentor.findUniqueOrThrow({ where: idOrUsernameOrAuthToUniqueWhere(auth) }));

    const project = await this.prisma.project.findFirstOrThrow({
      where: {
        id: projectId,
        ...(auth.personType === PersonType.STUDENT
          ? { students: { some: { id: auth.id } } }
          : { mentors: { some: { id: auth.id } } }),
      },
      include: {
        students: true,
        mentors: true,
        event: true,
      },
    });

    if (preventingProgress) {
      description = "***PROGRESS IS BEING PREVENTED***\n" + description
    }

    await createSupportTicket(type, project, null, description, reporter, preventingProgress);

    return true;
  }
}
