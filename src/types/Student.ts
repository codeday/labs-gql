import {
  Prisma, Student as PrismaStudent, Project as PrismaProject, Tag as PrismaTag, PrismaClient, AdmissionRating,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Int,
} from 'type-graphql';
import { Container } from 'typedi';
import GraphQLJSON from 'graphql-type-json';
import { DateTime } from 'luxon';
import { StudentStatus, RejectionReason, Track } from '../enums';
import { AuthRole } from '../context';
import { Project } from './Project';
import { TrackRecommendation } from './TrackRecommendation';
import { Tag } from './Tag';

@ObjectType()
export class Student implements PrismaStudent {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  username: string

  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  name(): string {
    return `${this.givenName} ${this.surname}`;
  }

  @Field(() => String)
  email: string

  @Field(() => StudentStatus)
  status: StudentStatus

  @Field(() => Track)
  track: Track

  @Field(() => Int)
  minHours: number

  @Authorized(AuthRole.ADMIN)
  @Field(() => RejectionReason, { nullable: true })
  rejectionReason: RejectionReason | null

  @Field(() => GraphQLJSON)
  profile: Prisma.JsonValue

  @Field(() => Int)
  weeks: number

  @Authorized(AuthRole.ADMIN)
  @Field(() => String)
  partnerCode: string

  @Field(() => Boolean)
  hasValidAdmissionOffer(): boolean {
    return this.status === 'OFFERED' && (!this.offerDate || DateTime.fromJSDate(this.offerDate).diffNow().days <= 3);
  }

  @Authorized(AuthRole.ADMIN)
  @Field(() => Date, { nullable: true })
  offerDate: Date | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => Number, { nullable: true })
  admissionRatingAverage: number | null;

  @Authorized(AuthRole.ADMIN)
  @Field(() => Number, { nullable: true })
  admissionRatingCount: number | null;

  admissionRatings?: AdmissionRating[];

  @Field(() => [TrackRecommendation], { nullable: true })
  async trackRecommendation(): Promise<TrackRecommendation[] | undefined> {
    if (!this.admissionRatings) return undefined;

    const ratingsSum = this.admissionRatings
      .map(({ track }) => track)
      .reduce((accum, k) => ({ ...accum, [k]: (k in accum ? accum[k as keyof typeof accum] : 0) + 1 }), {});

    return Object.keys(ratingsSum)
      .map((track): TrackRecommendation => ({
        track: track as Track,
        weight: ratingsSum[track as keyof typeof ratingsSum] / this.admissionRatings!.length,
      }));
  }

  tags: PrismaTag[]

  @Field(() => [Tag], { name: 'tags' })
  async fetchTags(): Promise<PrismaTag[]> {
    if (this.tags) return this.tags;
    return Container.get(PrismaClient).tag.findMany({ where: { students: { some: { id: this.id } } } });
  }

  projects?: PrismaProject[] | null

  @Field(() => [Project], { name: 'projects' })
  async fetchProjects(): Promise<PrismaProject[]> {
    if (this.projects) return this.projects;
    return Container.get(PrismaClient).project.findMany({ where: { students: { some: { id: this.id } } } });
  }
}
