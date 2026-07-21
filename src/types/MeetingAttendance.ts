import {
  Prisma,
  MeetingAttendance as PrismaMeetingAttendance,
  Meeting as PrismaMeeting,
  Student as PrismaStudent,
  PrismaClient,
  AttendanceSource,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Ctx,
} from 'type-graphql';
import { Container } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthRole, Context } from '../context';
import { Meeting } from './Meeting';
import { Student } from './Student';

@ObjectType()
export class MeetingAttendance implements PrismaMeetingAttendance {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => Boolean)
  attended: boolean

  @Field(() => Boolean)
  prepared: boolean

  // Attendance tracking
  @Field(() => AttendanceSource)
  source: AttendanceSource

  @Field(() => Number)
  confidence: number

  @Field(() => GraphQLJSONObject, { nullable: true })
  metadata: Prisma.JsonValue | null

  // Relations
  @Field(() => String)
  meetingId: string

  meeting?: PrismaMeeting

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
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
  studentId: string | null

  student?: PrismaStudent

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @Field(() => Student, { nullable: true, name: 'student' })
  async fetchStudent(): Promise<PrismaStudent | null> {
    if (!this.studentId) return null;
    if (!this.student) {
      this.student = (await Container.get(PrismaClient).student.findUnique({
        where: { id: this.studentId },
      })) || undefined;
    }
    return this.student || null;
  }
}
