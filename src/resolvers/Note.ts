import {
  Resolver, Authorized, Arg, Ctx, Mutation, Float,
} from 'type-graphql';
import { Note as PrismaNote, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Note } from '../types/Note';
import { IdOrUsernameOrEmailInput } from '../inputs';

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
  ): Promise<PrismaNote> {
    const student = await this.prisma.student.findFirst({
      where: {
        ...studentWhere.toQuery(),
        event: { id: auth.eventId },
      },
      select: { id: true },
      rejectOnNotFound: true,
    });

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
