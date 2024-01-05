import {
  Resolver, Authorized, Query, Ctx, Arg, Mutation,
} from 'type-graphql';
import { Event as PrismaEvent, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { AuthRole, Context } from '../context';
import { Event } from '../types';
import { EventEditInput, EventsWhereInput } from '../inputs';
import { DateTime } from 'luxon';
import { nameToSlug } from '../utils';

@Service()
@Resolver(Event)
export class EventResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized()
  @Query(() => Event, { nullable: true })
  async event(
    @Ctx() { auth }: Context,
  ): Promise<PrismaEvent> {
    return this.prisma.event.findUnique({ where: { id: auth.eventId! }, rejectOnNotFound: true });
  }

  @Query(() => [Event])
  async events(
    @Ctx() { auth }: Context,
    @Arg('where', () => EventsWhereInput, { nullable: true }) where?: EventsWhereInput,
  ): Promise<PrismaEvent[]> {
    return this.prisma.event.findMany({
      where: where ? where.toQuery(auth) : {},
      orderBy: [{ startsAt: 'desc' }]
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Event)
  async editEvent(
    @Ctx() { auth }: Context,
    @Arg('data', () => EventEditInput) data: EventEditInput,
  ): Promise<PrismaEvent> {
    return this.prisma.event.update({
      where: { id: auth.eventId! },
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Event)
  async cloneEvent(
    @Ctx() { auth }: Context,
    @Arg('name', () => String) name: string,
    @Arg('startsAt', () => Date) startsAt: Date,
  ): Promise<PrismaEvent> {
    const source = await this.prisma.event.findUnique({
      where: { id: auth.eventId },
      rejectOnNotFound: true,
      include: {
        surveys: {
          include: {
            surveyOccurences: true,
          },
        },
        resources: true,
        meetings: true,
        artifactTypes: true,
        studentTrainingGroup: {
          include: {
            entries: true,
          },
        },
      },
    });

    const newStart = DateTime.fromJSDate(startsAt);
    const sourceStart = DateTime.fromJSDate(source.startsAt);
    const diff = newStart.diff(sourceStart);

    const event = await this.prisma.event.create({
      data: {
        id: nameToSlug(name),
        name,
        startsAt,
        title: source.title,
        emailSignature: source.emailSignature,
        certificationStatements: source.certificationStatements,

        defaultWeeks: source.defaultWeeks,
        hasBeginner: source.hasBeginner,
        hasIntermediate: source.hasIntermediate,
        hasAdvanced: source.hasAdvanced,

        studentApplicationsStartAt: (
          DateTime.fromJSDate(source.studentApplicationsStartAt)
            .plus(diff)
            .toJSDate()
        ),
        studentApplicationsEndAt: (
          DateTime.fromJSDate(source.studentApplicationsEndAt)
            .plus(diff)
            .toJSDate()
        ),
        studentApplicationSchema: source.studentApplicationSchema as any,
        studentApplicationUi: source.studentApplicationUi as any,
        studentApplicationPostprocess: source.studentApplicationPostprocess as any,

        mentorApplicationsStartAt: (
          DateTime.fromJSDate(source.mentorApplicationsStartAt)
            .plus(diff)
            .toJSDate()
        ),
        mentorApplicationsEndAt: (
          DateTime.fromJSDate(source.mentorApplicationsEndAt)
            .plus(diff)
            .toJSDate()
        ),
        mentorApplicationSchema: source.mentorApplicationSchema as any,
        mentorApplicationUi: source.mentorApplicationUi as any,
        mentorApplicationPostprocess: source.mentorApplicationPostprocess as any,

        isActive: true,
        matchPreferenceSubmissionOpen: false,
        matchComplete: false,
        partnersOnly: source.partnersOnly,

        slackWorkspaceId: source.slackWorkspaceId,
        slackWorkspaceAccessToken: source.slackWorkspaceAccessToken,
        slackUserGroupId: null,
        standupAndProsperToken: source.standupAndProsperToken,
        standupAiModelVague: source.standupAiModelVague,
        standupAiModelVaguePending: source.standupAiModelVaguePending,
        standupAiModelWorkload: source.standupAiModelWorkload,
        standupAiModelWorkloadPending: source.standupAiModelWorkloadPending,
      },
    });

    if (source.surveys.length > 0) {
      for(const s of source.surveys) {
        const survey = await this.prisma.survey.create({
          data: {
            slug: s.slug,
            name: s.name,
            intro: s.intro,
            randomize: s.randomize,
            internal: s.internal,
            personType: s.personType,

            selfSchema: s.selfSchema as any || undefined,
            selfUi: s.selfUi as any || undefined,
            selfShare: s.selfShare as any || undefined,
            selfCaution: s.selfCaution || undefined,
            selfDisplay: s.selfDisplay || undefined,

            peerSchema: s.peerSchema as any || undefined,
            peerUi: s.peerUi as any || undefined,
            peerShare: s.peerShare as any || undefined,
            peerCaution: s.peerCaution || undefined,
            peerDisplay: s.peerDisplay || undefined,

            menteeSchema: s.menteeSchema as any || undefined,
            menteeUi: s.menteeUi as any || undefined,
            menteeShare: s.menteeShare as any || undefined,
            menteeCaution: s.menteeCaution || undefined,
            menteeDisplay: s.menteeDisplay || undefined,

            mentorSchema: s.mentorSchema as any || undefined,
            mentorUi: s.mentorUi as any || undefined,
            mentorShare: s.mentorShare as any || undefined,
            mentorCaution: s.mentorCaution || undefined,
            mentorDisplay: s.mentorDisplay || undefined,

            projectSchema: s.projectSchema as any || undefined,
            projectUi: s.projectUi as any || undefined,
            projectShare: s.projectShare as any || undefined,
            projectCaution: s.projectCaution || undefined,
            projectDisplay: s.projectDisplay || undefined,

            event: { connect: { id: event.id } },
          },
        });

        await this.prisma.surveyOccurence.createMany({
          data: s.surveyOccurences.map(so => ({
            visibleAt: DateTime.fromJSDate(so.dueAt).plus(diff).toJSDate(),
            dueAt: DateTime.fromJSDate(so.dueAt).plus(diff).toJSDate(),
            sentOverdueReminder: false,
            sentVisibleReminder: false,
            surveyId: survey.id,
          })),
        });
      }
    }

    if (source.resources.length > 0) {
      await this.prisma.resource.createMany({
        data: source.resources.map(r => ({
          name: r.name,
          link: r.link,
          displayToManagers: r.displayToManagers,
          displayToMentors: r.displayToMentors,
          displayToPartners: r.displayToPartners,
          displayToStudents: r.displayToStudents,
          eventId: event.id,
        }))
      });
    }

    if (source.artifactTypes.length > 0) {
      await this.prisma.artifactType.createMany({
        data: source.artifactTypes.map(at => ({
          name: at.name,
          description: at.description,
          personType: at.personType,
          eventId: event.id,
        }))
      })
    }

    if (source.meetings.length > 0) {
      await this.prisma.meeting.createMany({
        data: source.meetings.map(m => ({
          visibleAt: DateTime.fromJSDate(m.visibleAt).plus(diff).toJSDate(),
          dueAt: DateTime.fromJSDate(m.dueAt).plus(diff).toJSDate(),
          sentAgendaVisibleReminder: false,
          sentAgendaOverdueReminder: false,
          sentMeetingReminder: false,
          agendaStudentSchema: m.agendaStudentSchema as any || undefined,
          agendaStudentUi: m.agendaStudentUi as any || undefined,
          notesStudentSchame: m.notesStudentSchema as any || undefined,
          notesStudentUi: m.notesStudentUi as any || undefined,
          eventId: event.id,
        })),
      });
    }

    if (source.studentTrainingGroup) {
      const studentTrainingGroup = await this.prisma.trainingGroup.create({
        data: {
          name: source.studentTrainingGroup.name,
          events: { connect: { id: event.id } },
        },
      });

      await this.prisma.trainingEntry.createMany({
        data: source.studentTrainingGroup.entries.map(e => ({
          sort: e.sort,
          name: e.name,
          type: e.type,
          content: e.content,
          videoId: e.videoId,
          videoTranscript: e.videoTranscript,
          quizSchema: e.quizSchema as any || undefined,
          quizUi: e.quizUi as any || undefined,
          quizScore: e.quizScore as any || undefined,
          trainingGroupId: studentTrainingGroup.id,
        })),
      });
    }
    
    return event;
  }
}
