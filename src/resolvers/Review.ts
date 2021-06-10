import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx, Int,
} from 'type-graphql';
import {
  PrismaClient, RejectionReason, Student as PrismaStudent, StudentStatus, Track,
} from '@prisma/client';
import { Inject, Service } from 'typedi';
import { randInt } from '../utils';
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
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 10,
    });
    return results.length > 0 ? results[randInt(0, results.length)] : null;
  }

  @Authorized(AuthRole.REVIEWER)
  @Mutation(() => Boolean)
  async submitStudentRating(
    @Ctx() { auth }: Context,
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
    @Arg('rating', () => Int) rating: number,
    @Arg('track', () => Track) track: Track,
  ): Promise<boolean> {
    if (!auth.username) throw Error('Reviewers require username in token.');
    if (rating > 10 || rating < 1 || Math.floor(rating) !== rating) throw Error('Rating must be an int from 1 - 10.');
    await this.prisma.admissionRating.create({
      data: {
        ratedBy: auth.username,
        rating,
        track,
        student: { connect: where },
      },
    });
    return true;
  }

  @Authorized(AuthRole.ADMIN)
  @Query(() => [Student])
  async studentsTopRated(
    @Arg('skip', () => Number, { nullable: true }) skip?: number,
    @Arg('take', () => Number, { nullable: true }) take?: number,
    @Arg('track', () => Track, { nullable: true }) track?: Track,
  ): Promise<PrismaStudent[]> {
    const topRatings = await this.prisma.admissionRating.groupBy({
      skip,
      take,
      by: ['studentId'],
      _avg: { rating: true },
      _count: { rating: true },
      where: { student: { track } },
      orderBy: { _avg: { rating: 'desc' } },
    });
    const students = <Record<string, PrismaStudent>>(await this.prisma.student.findMany({
      skip,
      take,
      where: { id: { in: topRatings.map(({ studentId }) => studentId) } },
      include: { admissionRatings: { select: { track: true } } },
    })).reduce((accum, student) => ({ ...accum, [student.id]: student }), {});

    return topRatings
      .map(({ studentId, _avg, _count }) => ({
        ...students[studentId],
        admissionRatingAverage: _avg?.rating,
        admissionRatingCount: _count?.rating,
      }));
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Student)
  offerStudentAdmission(
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    return this.prisma.student.update({ where, data: { status: StudentStatus.OFFERED, offerDate: new Date() } });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Student)
  resetStudentAdmissionOffer(
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
  ): Promise<PrismaStudent> {
    return this.prisma.student.update({ where, data: { offerDate: new Date() } });
  }

  @Authorized(AuthRole.STUDENT)
  @Mutation(() => Student)
  async acceptStudentOffer(
    @Ctx() { auth }: Context,
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
      data: { status: StudentStatus.ACCEPTED },
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Student)
  rejectStudent(
    @Arg('where', () => IdOrUsernameInput) where: IdOrUsernameInput,
    @Arg('reason', () => RejectionReason, { nullable: true }) reason?: RejectionReason,
  ): Promise<PrismaStudent> {
    return this.prisma.student.update({
      where,
      data: {
        status: StudentStatus.REJECTED, rejectionReason: reason || RejectionReason.OTHER,
      },
    });
  }
}
