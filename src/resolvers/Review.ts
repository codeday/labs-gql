import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx, Int,
} from 'type-graphql';
import {
  PrismaClient, RejectionReason, Student as PrismaStudent, StudentStatus, Track,
} from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Inject, Service } from 'typedi';
import { idOrUsernameToUniqueWhere, randInt, validatePartnerStudent, validateStudentEvent } from '../utils';
import { Context, AuthRole } from '../context';
import { Student } from '../types';
import {
  IdOrUsernameInput,
} from '../inputs';

@Service()
@Resolver(Student)
export class ReviewResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.REVIEWER)
  @Query(() => Student, { nullable: true })
  async nextStudentNeedingRating(
    @Ctx() { auth }: Context,
    @Arg('track', () => Track, { nullable: true }) track?: Track,
  ): Promise<PrismaStudent | null> {
    if (!auth.username) throw Error('Reviewers require username in token.');
    const results = await this.prisma.student.findMany({
      where: {
        track,
        admissionRatings: { none: { ratedBy: auth.username } },
        username: { not: auth.username },
        status: StudentStatus.APPLIED,
        eventId: auth.eventId,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true },
      take: 1000,
    });
    if (results.length === 0) return null;
    const id = results[randInt(0, results.length)].id;
    return this.prisma.student.findUnique({ where: { id } });
  }

  @Authorized(AuthRole.REVIEWER)
  @Mutation(() => Boolean)
  async submitStudentRating(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
    @Arg('rating', () => Int) rating: number,
    @Arg('track', () => Track) track: Track,
  ): Promise<boolean> {
    await validateStudentEvent(auth, where);
    if (!auth.username) throw Error('Reviewers require username in token.');
    if (rating > 10 || rating < 1 || Math.floor(rating) !== rating) throw Error('Rating must be an int from 1 - 10.');
    await this.prisma.admissionRating.create({
      data: {
        ratedBy: auth.username,
        rating,
        track,
        student: { connect: idOrUsernameToUniqueWhere(auth, where) },
      },
    });
    return true;
  }

  @Authorized(AuthRole.ADMIN)
  @Query(() => [Student])
  async studentsTopRated(
    @Ctx() { auth }: Context,
    @Arg('includeRejected', () => Boolean, { nullable: true }) includeRejected?: boolean,
    @Arg('skip', () => Number, { nullable: true }) skip?: number,
    @Arg('take', () => Number, { nullable: true }) take?: number,
    @Arg('track', () => Track, { nullable: true }) track?: Track,
  ): Promise<PrismaStudent[]> {
    const statuses = [
      StudentStatus.APPLIED,
      StudentStatus.TRACK_CHALLENGE,
      StudentStatus.TRACK_INTERVIEW,
      ...(includeRejected ? [StudentStatus.REJECTED] : []),
    ];

    type RatingInfo = { admissionRatingAverage: number, admissionRatingCount: number }; 

    const topRatings = <Record<string, RatingInfo>>(await this.prisma.admissionRating.groupBy({
      skip,
      take,
      by: ['studentId'],
      _avg: { rating: true },
      _count: { rating: true },
      where: {
        student: {
          track,
          eventId: auth.eventId!,
          status: {
            in: statuses,
          },
        },
      },
      orderBy: { _avg: { rating: 'desc' } },
    })).reduce((accum, e) => ({
      ...accum,
      [e.studentId]: { admissionRatingAverage: e._avg?.rating, admissionRatingCount: e._count?.rating}
    }), {});

    const students = (await this.prisma.student.findMany({
      skip,
      take,
      where: { eventId: auth.eventId!, status: { in: statuses }, track },
      include: { admissionRatings: { select: { track: true } } },
    }));

    return students
      .map(s => ({ ...s, ...topRatings[s.id] }))
      .sort((a, b) => {
        if (a.admissionRatingAverage > b.admissionRatingAverage) return -1;
        else return 1;
      });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER)
  @Mutation(() => Student)
  async offerStudentAdmission(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    await validateStudentEvent(auth, where);
    await validatePartnerStudent(auth, where);
    return this.prisma.student.update({
      where: idOrUsernameToUniqueWhere(auth, where),
      data: { status: StudentStatus.OFFERED, offerDate: new Date() },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER)
  @Mutation(() => Student)
  async resetStudentAdmissionOffer(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    await validateStudentEvent(auth, where);
    await validatePartnerStudent(auth, where);
    return this.prisma.student.update({
      where: idOrUsernameToUniqueWhere(auth, where),
      data: { offerDate: new Date() },
    });
  }

  @Authorized(AuthRole.STUDENT)
  @Mutation(() => Student)
  async acceptStudentOffer(
    @Ctx() { auth }: Context,
    @Arg('timeManagementPlan', () => GraphQLJSONObject, { nullable: true }) timeManagementPlan?: object,
    @Arg('eventContractData', () => GraphQLJSONObject, { nullable: true }) eventContractData?: object,
    @Arg('partnerContractData', () => GraphQLJSONObject, { nullable: true }) partnerContractData?: object,
    @Arg('timezone', () => String, { nullable: true }) timezone?: string,
  ): Promise<PrismaStudent> {
    const student = await this.prisma.student.findUnique({
      where: auth.toWhere(),
      select: { status: true, offerDate: true },
    });
    if (!student) throw Error('No application found.');
    if (!Object.assign(new Student(), student).hasValidAdmissionOffer()) {
      throw Error('Admission has not been offered, or your offer expired.');
    }

    return this.prisma.student.update({
      where: auth.toWhere(),
      data: { status: StudentStatus.ACCEPTED, timeManagementPlan, timezone, eventContractData, partnerContractData },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER)
  @Mutation(() => Student)
  async rejectStudent(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
    @Arg('reason', () => RejectionReason, { nullable: true }) reason?: RejectionReason,
  ): Promise<PrismaStudent> {
    await validateStudentEvent(auth, where);
    await validatePartnerStudent(auth, where);
    return this.prisma.student.update({
      where: idOrUsernameToUniqueWhere(auth, where),
      data: {
        status: StudentStatus.REJECTED, rejectionReason: reason || RejectionReason.OTHER,
      },
    });
  }
}
