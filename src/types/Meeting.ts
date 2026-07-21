import {
  Prisma,
  Meeting as PrismaMeeting,
  MeetingResponse as PrismaMeetingResponse,
  MeetingAttendance as PrismaMeetingAttendance,
  Event as PrismaEvent,
  Project as PrismaProject,
  PrismaClient,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Ctx,
} from 'type-graphql';
import { Container } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthRole, Context } from '../context';
import { Event } from './Event';
import { Project } from './Project';
import { MeetingResponse } from './MeetingResponse';
import { MeetingAttendance } from './MeetingAttendance';

@ObjectType()
export class Meeting implements PrismaMeeting {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => Date)
  visibleAt: Date

  @Field(() => Date)
  dueAt: Date

  @Field(() => Boolean)
  sentAgendaVisibleReminder: boolean

  @Field(() => Boolean)
  sentAgendaOverdueReminder: boolean

  @Field(() => Boolean)
  sentMeetingReminder: boolean

  @Field(() => GraphQLJSONObject, { nullable: true })
  agendaStudentSchema: Prisma.JsonValue | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  agendaStudentUi: Prisma.JsonValue | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  notesStudentSchema: Prisma.JsonValue | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  notesStudentUi: Prisma.JsonValue | null

  // Slack Integration
  @Field(() => String, { nullable: true })
  slackHuddleId: string | null

  @Field(() => Date, { nullable: true })
  scheduledStartAt: Date | null

  @Field(() => Date, { nullable: true })
  scheduledEndAt: Date | null

  // Relations
  @Field(() => String)
  eventId: string

  event?: PrismaEvent

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUnique({
        where: { id: this.eventId },
      }))!;
    }
    return this.event;
  }

  @Field(() => String, { nullable: true })
  projectId: string | null

  project?: PrismaProject

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Field(() => Project, { nullable: true, name: 'project' })
  async fetchProject(): Promise<PrismaProject | null> {
    if (!this.projectId) return null;
    if (!this.project) {
      this.project = (await Container.get(PrismaClient).project.findUnique({
        where: { id: this.projectId },
      })) || undefined;
    }
    return this.project || null;
  }

  responses?: PrismaMeetingResponse[]

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Field(() => [MeetingResponse], { name: 'responses' })
  async fetchResponses(): Promise<PrismaMeetingResponse[]> {
    if (!this.responses) {
      this.responses = await Container.get(PrismaClient).meetingResponse.findMany({
        where: { meetingId: this.id },
      });
    }
    return this.responses;
  }

  attendance?: PrismaMeetingAttendance[]

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @Field(() => [MeetingAttendance], { name: 'attendance' })
  async fetchAttendance(): Promise<PrismaMeetingAttendance[]> {
    if (!this.attendance) {
      this.attendance = await Container.get(PrismaClient).meetingAttendance.findMany({
        where: { meetingId: this.id },
        include: { student: true },
      });
    }
    return this.attendance;
  }
}
