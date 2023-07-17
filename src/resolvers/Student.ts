import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient, Student as PrismaStudent, StudentStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Student } from '../types';
import {
  IdOrUsernameInput, StudentApplyInput, StudentCreateInput, StudentEditInput, StudentFilterInput,
} from '../inputs';
import { StudentOnlySelf } from './decorators';
import { eventAllowsApplicationStudent, idOrUsernameOrAuthToUniqueWhere, validateStudentEvent } from '../utils';

@Service()
@Resolver(Student)
export class StudentResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER, AuthRole.MANAGER)
  @Query(() => [Student])
  async students(
    @Ctx() { auth }: Context,
    @Arg('where', () => StudentFilterInput, { nullable: true }) where?: StudentFilterInput,
    @Arg('skip', () => Number, { nullable: true }) skip?: number,
    @Arg('take', () => Number, { nullable: true }) take?: number,
  ): Promise<PrismaStudent[]> {
    if (auth.isManager) {
      return this.prisma.student.findMany({
        where: {
          eventId: auth.eventId,
          projects: {
            some: {
              mentors: {
                some: {
                  managerUsername: auth.username,
                },
              },
            },
          },
        },
        skip,
        take,
        include: {
          notes: true,
          targetSurveyResponses: {
            where: { surveyOccurence: { survey: { internal: false } } },
            include: {
              surveyOccurence: { include: { survey: true } },
              authorMentor: true,
              authorStudent: true,
              mentor: true,
              student: true,
              project: true,
            },
          }
        }
      });
    } else if (auth.isPartner) {
      return this.prisma.student.findMany({
        where: {
          partnerCode: { equals: auth.partnerCode!, mode: 'insensitive' },
          eventId: auth.eventId,
        },
        skip,
        take,
        include: {
          notes: true,
          targetSurveyResponses: {
            where: { surveyOccurence: { survey: { internal: false } } },
            include: {
              surveyOccurence: { include: { survey: true } },
              authorMentor: true,
              authorStudent: true,
              mentor: true,
              student: true,
              project: true,
            },
          }
        }
      })
    }

    return this.prisma.student.findMany({
      where: {
        ...where?.toQuery(),
        eventId: auth.eventId,
      },
      skip,
      take,
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.STUDENT)
  @StudentOnlySelf('where')
  @Query(() => Student, { nullable: true })
  async student(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaStudent | null> {
    if (where) await validateStudentEvent(auth, where);

    const student = await this.prisma.student.findUnique({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      include: { event: true },
    });
    if (!student) return null;
    if (student.event.id !== auth.eventId) return null;
    return student;
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Student)
  async createStudent(
    @Ctx() { auth }: Context,
    @Arg('data', () => StudentCreateInput) data: StudentCreateInput,
  ): Promise<PrismaStudent> {
    return this.prisma.student.create({
      data: {
        ...data.toQuery(),
        event: { connect: { id: auth.eventId! } },
      },
    });
  }

  @Authorized(AuthRole.APPLICANT_STUDENT)
  @Mutation(() => Student)
  async applyStudent(
    @Ctx() { auth }: Context,
    @Arg('data', () => StudentApplyInput) data: StudentApplyInput,
  ): Promise<PrismaStudent> {
    if (!auth.username) throw Error('Username is required in token for student applicants.');
    const event = await this.prisma.event.findUnique({ where: { id: auth.eventId } });
    if (!event) throw Error('Event does not exist.');
    if (!eventAllowsApplicationStudent(event)) throw Error('Student applications are not open for this event.');

    return this.prisma.student.create({
      data: {
        ...data.toQuery(),
        event: { connect: { id: auth.eventId! } },
        username: auth.username,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.STUDENT)
  @StudentOnlySelf('where')
  @Mutation(() => Student)
  async editStudent(
    @Ctx() { auth }: Context,
    @Arg('data', () => StudentEditInput) data: StudentEditInput,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    if (where) await validateStudentEvent(auth, where);

    if ((data.username || data.partnerCode || data.status || data.weeks) && !auth.isAdmin) {
      throw Error('You do not have permission to edit restricted fields.');
    }

    return this.prisma.student.update({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteStudent(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<boolean> {
    await this.prisma.student.deleteMany({ where: { ...where, eventId: auth.eventId! } });
    return true;
  }

  @Authorized(AuthRole.STUDENT)
  @Mutation(() => Student)
  async cancelStudentApplication(
    @Ctx() { auth }: Context,
  ): Promise<PrismaStudent> {
    return this.prisma.student.update({
      where: auth.toWhere(),
      data: { status: StudentStatus.CANCELED },
    });
  }
}
