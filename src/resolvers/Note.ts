import {
  Resolver, Authorized, Arg, Ctx, Mutation, Float,
} from 'type-graphql';
import { Note as PrismaNote, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Note } from '../types/Note';
import { IdOrUsernameOrEmailInput } from '../inputs';
import { SupportTicketType } from '../enums';
import { createSupportTicket } from '../linear/createSupportTicket';
import { selectProjectForSupportTicket } from '../linear/selectProjectForSupportTicket';

@Service()
@Resolver(Note)
export class NoteResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Note)
  async addNote(
    @Ctx() { auth }: Context,
    @Arg('student', () => IdOrUsernameOrEmailInput) studentWhere: IdOrUsernameOrEmailInput,
    @Arg('note', () => String) note: string,
    @Arg('caution', () => Float) caution: number,
    @Arg('supportTicketType', () => SupportTicketType, { nullable: true }) supportTicketType?: SupportTicketType,
    @Arg('projectId', () => String, { nullable: true }) projectId?: string,
  ): Promise<PrismaNote> {
    const student = await this.prisma.student.findFirst({
      where: {
        ...studentWhere.toQuery(),
        event: { id: auth.eventId },
      },
      include: { projects: { include: { mentors: true, students: true, event: true }} },
      rejectOnNotFound: true,
    });

    if (supportTicketType && student.projects.length > 0) {
      const project = selectProjectForSupportTicket(student.projects, projectId);
      await createSupportTicket(
        supportTicketType,
        project,
        [student],
        note,
        auth.username!
      );
    }

    return this.prisma.note.create({
      data: {
        event: { connect: { id: auth.eventId } },
        student: { connect: { id: student.id } },
        username: auth.username!,
        note,
        caution,
      },
    });
  }
}
