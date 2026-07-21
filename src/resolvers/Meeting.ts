import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import {
  PrismaClient,
  Meeting as PrismaMeeting,
  MeetingAttendance as PrismaMeetingAttendance,
} from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Meeting, MeetingAttendance } from '../types';
import { MeetingCreateInput, MeetingAttendanceInput } from '../inputs';
import { makeDebug } from '../utils';

const DEBUG = makeDebug('resolvers:Meeting');

@Service()
@Resolver(Meeting)
export class MeetingResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [Meeting])
  async meetings(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
    @Arg('projectId', () => String, { nullable: true }) projectId?: string,
  ): Promise<PrismaMeeting[]> {
    return this.prisma.meeting.findMany({
      where: {
        eventId: eventId || auth.eventId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { scheduledStartAt: 'desc' },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT)
  @Query(() => Meeting, { nullable: true })
  async meeting(
    @Ctx() { auth }: Context,
    @Arg('id', () => String) id: string,
  ): Promise<PrismaMeeting | null> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!meeting) return null;

    // Verify access
    if (!auth.isAdmin && !auth.isManager) {
      if (auth.isMentor || auth.isStudent) {
        if (meeting.eventId !== auth.eventId) {
          throw new Error('No permission to view this meeting.');
        }
      }
    }

    return meeting;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Meeting)
  async createMeeting(
    @Ctx() { auth }: Context,
    @Arg('data', () => MeetingCreateInput) data: MeetingCreateInput,
  ): Promise<PrismaMeeting> {
    DEBUG(`Creating meeting for event ${data.eventId}, project ${data.projectId || 'none'}`);

    return this.prisma.meeting.create({
      data: {
        eventId: data.eventId,
        projectId: data.projectId,
        visibleAt: data.visibleAt,
        dueAt: data.dueAt,
        scheduledStartAt: data.scheduledStartAt,
        scheduledEndAt: data.scheduledEndAt,
        agendaStudentSchema: data.agendaStudentSchema as any,
        agendaStudentUi: data.agendaStudentUi as any,
        notesStudentSchema: data.notesStudentSchema as any,
        notesStudentUi: data.notesStudentUi as any,
        slackHuddleId: data.slackHuddleId,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @Mutation(() => MeetingAttendance)
  async recordMeetingAttendance(
    @Ctx() { auth }: Context,
    @Arg('data', () => MeetingAttendanceInput) data: MeetingAttendanceInput,
  ): Promise<PrismaMeetingAttendance> {
    DEBUG(`Recording attendance for meeting ${data.meetingId}, student ${data.studentId}: ${data.attended}`);

    // Check for existing attendance record
    const existing = await this.prisma.meetingAttendance.findFirst({
      where: {
        meetingId: data.meetingId,
        studentId: data.studentId,
      },
    });

    if (existing) {
      // Update existing record
      return this.prisma.meetingAttendance.update({
        where: { id: existing.id },
        data: {
          attended: data.attended,
          prepared: data.prepared ?? existing.prepared,
          source: data.source ?? existing.source,
          confidence: data.confidence ?? existing.confidence,
          metadata: data.metadata as any ?? existing.metadata,
        },
      });
    }

    // Create new record
    return this.prisma.meetingAttendance.create({
      data: {
        meetingId: data.meetingId,
        studentId: data.studentId,
        attended: data.attended,
        prepared: data.prepared ?? false,
        source: data.source ?? 'MANUAL',
        confidence: data.confidence ?? 1.0,
        metadata: data.metadata as any,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @Query(() => [MeetingAttendance])
  async meetingAttendance(
    @Ctx() { auth }: Context,
    @Arg('meetingId', () => String) meetingId: string,
  ): Promise<PrismaMeetingAttendance[]> {
    return this.prisma.meetingAttendance.findMany({
      where: { meetingId },
      include: { student: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
