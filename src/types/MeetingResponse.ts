import {
  Prisma,
  MeetingResponse as PrismaMeetingResponse,
  Meeting as PrismaMeeting,
  Student as PrismaStudent,
  PrismaClient,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized,
} from 'type-graphql';
import { Container } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthRole } from '../context';
import { Meeting } from './Meeting';
import { Student } from './Student';

@ObjectType()
export class MeetingResponse implements PrismaMeetingResponse {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => GraphQLJSONObject, { nullable: true })
  agenda: Prisma.JsonValue | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  notes: Prisma.JsonValue | null

  // Relations
  @Field(() => String)
  meetingId: string

  meeting?: PrismaMeeting

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Field(() => Meeting, { name: 'meeting' })
  async fetchMeeting(): Promise<PrismaMeeting> {
    if (!this.meeting) {
      this.meeting = (await Container.get(PrismaClient).meeting.findUnique({
        where: { id: this.meetingId },
      }))!;
    }
    return this.meeting;
  }

  @Field(() => String, { nullable: true })
  authorStudentId: string | null

  authorStudent?: PrismaStudent

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Field(() => Student, { nullable: true, name: 'authorStudent' })
  async fetchAuthorStudent(): Promise<PrismaStudent | null> {
    if (!this.authorStudentId) return null;
    if (!this.authorStudent) {
      this.authorStudent = (await Container.get(PrismaClient).student.findUnique({
        where: { id: this.authorStudentId },
      })) || undefined;
    }
    return this.authorStudent || null;
  }
}
