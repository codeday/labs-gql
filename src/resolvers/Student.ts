import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx
} from 'type-graphql';
import { Prisma, PrismaClient, Student as PrismaStudent, StudentStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Student } from '../types';
import {
  IdOrUsernameInput, StudentApplyInput, StudentCreateInput, StudentEditInput, StudentFilterInput,
} from '../inputs';
import { StudentOnlySelf } from './decorators';
import { eventAllowsApplicationStudent, idOrUsernameOrAuthToUniqueWhere, uploadToBuffer, validateStudentEvent } from '../utils';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { parse } from 'csv-parse/sync';

@Service()
@Resolver(Student)
export class StudentResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER)
  @Mutation(() => [Student])
  async bulkImportStudents(
    @Ctx() { auth }: Context,
    @Arg('file', () => GraphQLUpload) file: FileUpload
  ): Promise<PrismaStudent[]> {
    const contents = parse(
      await uploadToBuffer(file),
      {
        columns: true,
        skip_empty_lines: true,
      }
    );

    const missing = contents.filter((student: any) => !student.givenName || !student.surname || !student.email)
    if (missing.length > 0) {
      throw new Error(`The following entries were invalid: ${JSON.stringify(missing)}`);
    }

    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: auth.eventId! }, rejectOnNotFound: true });

    const partner = auth.isPartner
      ? await this.prisma.partner.findFirstOrThrow({ where: { partnerCode: auth.partnerCode, eventId: auth.eventId! } })
      : null;

    const partnerStudentCount = auth.isPartner
      ? await this.prisma.student.count({ where: { partnerCode: auth.partnerCode, eventId: auth.eventId! } })
      : 0;

    const students: PrismaStudent[] = [];
    let addedCount = 0;

    for (const student of contents) {
      const { givenName, surname, email, username, track, minHours, partnerCode, ...rest } = student;
      const thisPartner = auth.isPartner
        ? partner
        : (auth.isAdmin && partnerCode ? await this.prisma.partner.findFirstOrThrow({ where: { partnerCode: partnerCode.toUpperCase(), eventId: auth.eventId! } }) : null);

      students.push(await this.prisma.student.create({
        data: {
          event: { connect: { id: auth.eventId! } },
          partnerCode: auth.partnerCode || (auth.isAdmin ? partnerCode?.toUpperCase?.() : null) || null,
          givenName,
          surname,
          email,
          username: username || null,
          track: track || 'BEGINNER',
          minHours: thisPartner?.minHours || 10,
          weeks: thisPartner?.weeks || event.defaultWeeks,
          profile: rest,
          status: auth.isAdmin
            ? StudentStatus.OFFERED
            : (partner?.maxStudents && partner.maxStudents >= (partnerStudentCount + ++addedCount)
              ? StudentStatus.OFFERED
              : StudentStatus.APPLIED),
        },
      }));
    }

    return students;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Query(() => [Student])
  async students(
    @Ctx() { auth }: Context,
    @Arg('where', () => StudentFilterInput, { nullable: true }) where?: StudentFilterInput,
    @Arg('skip', () => Number, { nullable: true }) skip?: number,
    @Arg('take', () => Number, { nullable: true }) take?: number,
  ): Promise<PrismaStudent[]> {
    const include: Prisma.StudentInclude = {
      notes: true,
      projects: {
        include: {
          mentors: true,
          tags: true,
          standupThreads: {
            select: {
              dueAt: true,
              id: true,
            },
            orderBy: [{ dueAt: 'asc' }]
          }
        }
      },
      standupResults: {
        select: {
          id: true,
          threadId: true,
          rating: true,
          humanRated: true,
        },
      },
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
    };

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
        include,
      });
    } else if (auth.isPartner) {
      return this.prisma.student.findMany({
        where: {
          partnerCode: { equals: auth.partnerCode!, mode: 'insensitive' },
          eventId: auth.eventId,
        },
        skip,
        take,
        include
      })
    } else if (auth.isMentor) {
      return this.prisma.student.findMany({
        where: {
          projects: {
            some: {
              mentors: {
                some: {
                  id: auth.id,
                },
              },
            },
          }
        },
        skip,
        take,
        include,
      });
    } else if (auth.isStudent) {
      return [
        await this.prisma.student.findUniqueOrThrow({
          where: idOrUsernameOrAuthToUniqueWhere(auth),
          include,
          rejectOnNotFound: true,
        })
      ];
    }

    return this.prisma.student.findMany({
      where: {
        ...where?.toQuery(),
        eventId: auth.eventId,
      },
      skip,
      take,
      include,
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.STUDENT, AuthRole.PARTNER)
  @StudentOnlySelf('where')
  @Query(() => Student, { nullable: true })
  async student(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaStudent | null> {
    if (where) await validateStudentEvent(auth, where);

    const student = await this.prisma.student.findUniqueOrThrow({
      where: idOrUsernameOrAuthToUniqueWhere(auth, where),
      include: { event: true },
    });
    if (!student) return null;
    if (student.event.id !== auth.eventId) return null;
    if (auth.type === AuthRole.PARTNER && student.partnerCode !== auth.partnerCode) return null;
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

  @Authorized([AuthRole.APPLICANT_STUDENT, AuthRole.APPLICANT_MENTOR])
  @Query(() => String, { nullable: true })
  async applicationId(
    @Ctx() { auth }: Context,
  ): Promise<string | null | undefined> {
    const where: Prisma.MentorWhereInput & Prisma.StudentWhereInput = {
      username: auth.username,
      eventId: auth.eventId,
    };

    if (auth.type === AuthRole.APPLICANT_MENTOR) return (await this.prisma.mentor.findFirstOrThrow({ where }))?.id;
    return (await this.prisma.student.findFirstOrThrow({ where }))?.id;
  }

  @Authorized([AuthRole.APPLICANT_STUDENT, AuthRole.APPLICANT_MENTOR])
  @Mutation(() => Boolean)
  async cancelApplication(
    @Ctx() { auth }: Context,
  ): Promise<Boolean> {
    const where: Prisma.MentorWhereInput & Prisma.StudentWhereInput = {
      username: auth.username,
      eventId: auth.eventId,
      status: 'APPLIED',
    };

    let count = 0;

    if (auth.type === AuthRole.APPLICANT_MENTOR) {
      count = (await this.prisma.mentor.deleteMany({ where })).count;
    } else {
      count = (await this.prisma.student.deleteMany({ where })).count;
    }

    if (count === 0) throw new Error(`Not found.`);

    return true;
  }

  @Authorized([AuthRole.APPLICANT_STUDENT])
  @Mutation(() => Boolean)
  async changePartnerCodeApplication(
    @Ctx() { auth }: Context,
    @Arg('partnerCode', () => String) partnerCode: string,
  ): Promise<Boolean> {

    const partner = await this.prisma.partner.findFirstOrThrow({
      rejectOnNotFound: true,
      where: {
        eventId: auth.eventId!,
        partnerCode: { equals: partnerCode.trim(), mode: 'insensitive' },
      }
    });

    const { count } = await this.prisma.student.updateMany({
      where: {
        username: auth.username,
        eventId: auth.eventId,
        status: 'APPLIED',
      },
      data: {
        ...(partner.minHours ? { minHours: partner.minHours } : {}),
        ...(partner.weeks ? { weeks: partner.weeks } : {}),
        ...(partner?.autoApprove ? { status: 'OFFERED' } : {}),
        skipPreferences: partner.skipPreferences,
        partnerCode: partner.partnerCode,
      }
    });

    if (count === 0) throw new Error(`Not found.`);

    return true;
  }

  @Authorized(AuthRole.APPLICANT_STUDENT)
  @Mutation(() => Student)
  async applyStudent(
    @Ctx() { auth }: Context,
    @Arg('data', () => StudentApplyInput) data: StudentApplyInput,
  ): Promise<PrismaStudent> {
    if (!auth.username) throw Error('Username is required in token for student applicants.');
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: auth.eventId } });
    if (!event) throw Error('Event does not exist.');
    if (!eventAllowsApplicationStudent(event)) throw Error('Student applications are not open for this event.');

    let partnerData: Partial<Prisma.StudentCreateInput> = { partnerCode: null };

    if (data.partnerCode) {
      const partner = await this.prisma.partner.findFirstOrThrow({
        where: {
          eventId: auth.eventId!,
          partnerCode: { equals: data.partnerCode.trim(), mode: 'insensitive' },
        }
      });

      if (partner) {
        partnerData = {
          ...(partner.minHours ? { minHours: partner.minHours } : {}),
          ...(partner.weeks ? { weeks: partner.weeks } : {}),
          skipPreferences: partner.skipPreferences,
          partnerCode: partner.partnerCode,
        };

        if (partner.autoApprove) {
          partnerData.status = 'OFFERED';
        }
      };
    }

    return this.prisma.student.create({
      data: {
        ...(await data.toQuery()),
        weeks: event.defaultWeeks,
        ...partnerData,
        event: { connect: { id: auth.eventId! } },
        username: auth.username,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.STUDENT)
  @StudentOnlySelf('where')
  @Mutation(() => Student)
  async editStudent(
    @Ctx() { auth }: Context,
    @Arg('data', () => StudentEditInput) data: StudentEditInput,
    @Arg('where', () => IdOrUsernameInput, { nullable: true }) where?: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    if (where) await validateStudentEvent(auth, where);

    if ((data.username || data.partnerCode || data.status || data.weeks || data.interviewNotes || data.skipPreferences) && !(auth.isAdmin || auth.isManager)) {
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
