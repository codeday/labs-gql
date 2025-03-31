import {
  Prisma,
  Student as PrismaStudent,
  Project as PrismaProject,
  Tag as PrismaTag,
  TagTrainingSubmission as PrismaTagTrainingSubmission,
  PrismaClient,
  AdmissionRating,
  ProjectPreference as PrismaProjectPreference,
  SurveyResponse as PrismaSurveyResponse,
  Note as PrismaNote,
  Event as PrismaEvent,
  Artifact as PrismaArtifact,
  Partner as PrismaPartner,
  StandupThread,
  StandupResult,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Int, Ctx,
} from 'type-graphql';
import { Container } from 'typedi';
import GraphQLJSON from 'graphql-type-json';
import { DateTime } from 'luxon';
import {
  StudentStatus, RejectionReason, Track, ProjectStatus, MentorStatus,
} from '../enums';
import { AuthRole, Context } from '../context';
import { Project } from './Project';
import { TrackRecommendation } from './TrackRecommendation';
import { Preference } from './Preference';
import { Tag } from './Tag';
import { TagTrainingSubmission } from './TagTrainingSubmission';
import { Event } from './Event';
import { SurveyResponse } from './SurveyResponse';
import { Note } from './Note';
import { Artifact } from './Artifact';
import { tokenFor } from '../email/helpers';
import { SanitizableSurveyResponse, groupBy, sanitizeSurveyResponses } from '../utils';
import { StandupRating } from './StandupRating';
import { Partner } from './Partner';

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
  @Field(() => String, { nullable: true })
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

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => GraphQLJSON, { nullable: true })
  eventContractData: Prisma.JsonValue | null

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => GraphQLJSON, { nullable: true })
  partnerContractData: Prisma.JsonValue | null

  @Field(() => Int)
  weeks: number

  @Field(() => String, { nullable: true })
  partnerCode: string | null

  @Field(() => GraphQLJSON, { nullable: true })
  timeManagementPlan: Prisma.JsonValue | null

  @Field(() => String, { nullable: true })
  timezone: string | null

  @Field(() => Boolean)
  skipPreferences: boolean

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => String, { nullable: true })
  interviewNotes: string | null

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.REVIEWER])
  @Field(() => String, { nullable: true })
  resumeUrl: string

  @Authorized()
  @Field(() => String, { nullable: true })
  githubUsername: string

  @Field(() => Boolean)
  hasValidAdmissionOffer(): boolean {
    return this.status === 'OFFERED' && (!this.offerDate || DateTime.fromJSDate(this.offerDate).diffNow().days <= 3);
  }

  @Authorized(AuthRole.ADMIN)
  @Field(() => Date, { nullable: true })
  offerDate: Date | null

  @Field(() => String, { nullable: true })
  slackId: string | null

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
        weight: ratingsSum[track as keyof typeof ratingsSum] / (this.admissionRatings?.length || 1),
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

  @Field(() => Number)
  async projectCount(): Promise<number> {
    return (await this.fetchProjects()).length;
  }

  projectPreferences?: PrismaProjectPreference[] | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => [Preference], { name: 'projectPreferences' })
  async fetchProjectPreferences(): Promise<PrismaProjectPreference[]> {
    if (this.projectPreferences) return this.projectPreferences;
    return Container.get(PrismaClient).projectPreference.findMany({
      where: {
        student: { id: this.id },
        project: {
          status: ProjectStatus.ACCEPTED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
        },
      },
      include: {
        project: { include: { mentors: true } },
      },
    });
  }

  @Field(() => Boolean, { name: 'hasProjectPreferences' })
  async hasProjectPreferences(): Promise<boolean> {
    if (this.projectPreferences && this.projectPreferences.length > 0) {
      return true;
    }

    const prefCount = await Container.get(PrismaClient).projectPreference.count({
      where: {
        student: { id: this.id },
        project: {
          status: ProjectStatus.ACCEPTED,
          mentors: { some: { status: MentorStatus.ACCEPTED } },
        },
      },
    });

    return prefCount > 0;
  }

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => String, { name: 'token' })
  async token(): Promise<string> {
    return tokenFor(this);
  }

  tagTrainingSubmissions?: PrismaTagTrainingSubmission[] | null

  @Field(() => [TagTrainingSubmission], { name: 'tagTrainingSubmissions' })
  async fetchTagTrainingSubmissions(): Promise<PrismaTagTrainingSubmission[]> {
    if (this.tagTrainingSubmissions) return this.tagTrainingSubmissions;
    return Container.get(PrismaClient).tagTrainingSubmission.findMany({ where: { student: { id: this.id } } });
  }

  @Field(() => [Tag], { name: 'requiredTagTraining' })
  async fetchRequiredTagTraining(): Promise<PrismaTag[]> {
    const projects = await Container.get(PrismaClient).project.findMany({
      where: { students: { some: { id: this.id } } },
      include: { tags: { where: { trainingLink: { not: null } } } },
    });
    const tags: Record<string, Tag> = projects
      .map((p) => p.tags)
      .flat()
      .reduce((accum, tag) => ({ ...accum, [tag.id]: tag }), {});

    return Object.values(tags);
  }

  @Field(() => String)
  eventId: string;

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUnique({ where: { id: this.eventId } }))!;
    }

    return this.event;
  }

  partner?: PrismaPartner | null;

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.STUDENT])
  @Field(() => Partner, { name: 'partner', nullable: true })
  async fetchPartner(
    @Ctx() { auth }: Context,
  ): Promise<PrismaPartner | null> {
    if (auth.isStudent && auth.id !== this.id && auth.username !== this.username) {
      throw new Error(`Cannot access information about other students.`);
    }

    if (!this.partnerCode) return null;
    if (!this.partner) {
      this.partner = (await Container.get(PrismaClient).partner.findFirst({ where: { partnerCode: this.partnerCode!, eventId: this.eventId } })) || null;
    }

    return this.partner;
  }

  targetSurveyResponses?: SanitizableSurveyResponse[]
  surveyResponsesAbout?: SanitizableSurveyResponse[]

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT])
  @Field(() => [SurveyResponse], { name: 'surveyResponsesAbout' })
  async fetchSurveyResponsesAbout(
    @Ctx() { auth }: Context,
  ): Promise<PrismaSurveyResponse[]> {
    if (this.targetSurveyResponses) { // Included from DB.
      this.surveyResponsesAbout = this.targetSurveyResponses;
    }

    if (auth.isStudent && auth.id !== this.id && auth.username !== this.username) {
      throw new Error(`Cannot access information about other students.`);
    }

    if (!this.surveyResponsesAbout) {
      this.surveyResponsesAbout = (await Container.get(PrismaClient).surveyResponse.findMany({
        where: { studentId: this.id, surveyOccurence: { survey: { internal: false } } },
        include: {
          surveyOccurence: { include: { survey: true } },
          authorMentor: true,
          authorStudent: true,
          mentor: true,
          student: true,
          project: true,
        },
      }));
    }

    if (auth.isAdmin || auth.isManager || auth.isPartner)
      return this.surveyResponsesAbout;

    return sanitizeSurveyResponses(this.surveyResponsesAbout, auth);
  }

  notes?: PrismaNote[]

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR])
  @Field(() => [Note], { name: 'notes' })
  async fetchNotes(): Promise<PrismaNote[]> {
    if (!this.notes) {
      this.notes = (await Container.get(PrismaClient).note.findMany({
        where: { studentId: this.id },
      }));
    }

    return this.notes;
  }

  artifacts?: PrismaArtifact[] | null

  @Field(() => [Artifact], { name: 'artifacts' })
  async fetchArtifacts(): Promise<PrismaArtifact[]> {
    if (!this.artifacts) {
      this.artifacts = await Container.get(PrismaClient).artifact.findMany({
        where: { student: { id: this.id } },
      });
    }
    return this.artifacts;
  }

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT])
  @Field(() => Number, { name: 'emailCount' })
  async emailCount(): Promise<number> {
    return await Container.get(PrismaClient).projectEmail.count({
      where: { studentId: this.id }
    });
  }

  standupResults: StandupResult[] | null

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.STUDENT])
  @Field(() => [StandupRating], { name: 'standupRatings' })
  async fetchStandupRatings(
    @Ctx() { auth }: Context,
  ): Promise<StandupRating[]> {
    if (auth.isStudent && auth.id !== this.id && auth.username !== this.username) {
      throw new Error(`Cannot access information about other students.`);
    }
    const prisma = Container.get(PrismaClient);
    const projects = this.projects as (PrismaProject & { standupThreads?: StandupThread[] })[];
    const standupThreads = projects.filter(p => Array.isArray(p.standupThreads)).length > 0
      ? projects.flatMap(p => p.standupThreads || [])
      : await prisma.standupThread.findMany({
          where: { project: { students: { some: { id: this.id } } } },
          select: { id: true, dueAt: true },
        });

    const standups = Array.isArray(this.standupResults)
        ? this.standupResults
        : await prisma.standupResult.findMany({
          where: { studentId: this.id },
          select: { id: true, threadId: true, rating: true, humanRated: true },
        });

    const ratingsByThread = Object.fromEntries(
      standups.map(s => [s.threadId, s])
    );

    const cutoff = DateTime.now()
      .minus({ hours: 24 })
      .toJSDate();

    return standupThreads
      .filter(t => t.dueAt < cutoff)
      .sort((a, b) => a.dueAt < b.dueAt ? -1 : 1)
      .map(t => ({
        id: ratingsByThread[t.id]?.id || null,
        dueAt: t.dueAt,
        humanRated: ratingsByThread[t.id]?.humanRated || false,
        rating: t.id in ratingsByThread ? ratingsByThread[t.id].rating : 0,
      }));
  }
}
