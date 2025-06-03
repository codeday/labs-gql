import {
  Prisma,
  Project as PrismaProject,
  Mentor as PrismaMentor,
  Event as PrismaEvent,
  Artifact as PrismaArtifact,
  SurveyResponse as PrismaSurveyResponse,
  File as PrismaFile,
  PrismaClient,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Arg, Int, Ctx,
} from 'type-graphql';
import GraphQLJSON from 'graphql-type-json';
import Container from 'typedi';
import { MentorStatus } from '../enums';
import { AuthRole, Context } from '../context';
import { Project } from './Project';
import { SurveyResponse } from './SurveyResponse';
import { Event } from './Event';
import { Artifact } from './Artifact';
import { File } from './File';

@ObjectType()
export class Mentor implements PrismaMentor {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String, { nullable: true })
  username: string | null

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

  @Field(() => MentorStatus)
  status: MentorStatus

  @Field(() => GraphQLJSON)
  profile: Prisma.JsonValue

  @Field(() => String, { nullable: true })
  managerUsername: string | null

  @Field(() => Int)
  maxWeeks: number

  @Field(() => String)
  eventId: string;

  @Field(() => String, { nullable: true })
  slackId: string | null

  @Field(() => String, { nullable: true })
  timezone: string | null

  projectPreferences: string | null;

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR])
  @Field(() => String, { name: 'projectPreferences', nullable: true })
  fetchProjectPreferences(@Ctx() { auth }: Context ): string | null {
    if (auth.type === AuthRole.MENTOR && auth.id !== this.id) throw Error('Unauthorized.');
    return this.projectPreferences;
  }

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUnique({ where: { id: this.eventId } }))!;
    }

    return this.event;
  }

  projects?: PrismaProject[] | null

  @Field(() => [Project], { name: 'projects' })
  async fetchProjects(): Promise<PrismaProject[]> {
    if (this.projects) return this.projects;
    return Container.get(PrismaClient).project.findMany({ where: { mentors: { some: { id: this.id } } } });
  }

  @Field(() => GraphQLJSON, { nullable: true })
  profileField(
    @Arg('key', () => String) key: string,
  ): Prisma.JsonValue | null {
    if (typeof this.profile !== 'object' || this.profile === null) return null;
    return (this.profile as {[k: string]: Prisma.JsonValue | undefined})[key] || null;
  }

  @Authorized([AuthRole.PARTNER, AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR])
  @Field(() => Number, { name: 'emailCount' })
  async emailCount(): Promise<number> {
    return await Container.get(PrismaClient).projectEmail.count({
      where: { mentorId: this.id }
    });
  }

  artifacts?: PrismaArtifact[] | null

  @Field(() => [Artifact], { name: 'artifacts' })
  async fetchArtifacts(): Promise<PrismaArtifact[]> {
    if (!this.artifacts) {
      this.artifacts = await Container.get(PrismaClient).artifact.findMany({
        where: { mentor: { id: this.id } },
      });
    }
    return this.artifacts;
  }

  surveyResponsesAbout?: PrismaSurveyResponse[]

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => [SurveyResponse], { name: 'surveyResponsesAbout' })
  async fetchSurveyResponsesAbout(): Promise<PrismaSurveyResponse[]> {
    if (!this.surveyResponsesAbout) {
      this.surveyResponsesAbout = (await Container.get(PrismaClient).surveyResponse.findMany({
        where: { mentorId: this.id, surveyOccurence: { survey: { internal: false } } },
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

    return this.surveyResponsesAbout;
  }

  files?: PrismaFile[] | null

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR])
  @Field(() => [File], { name: 'files' })
  async fetchFiles(@Ctx() { auth }: Context): Promise<PrismaFile[]> {
    if (auth.type === AuthRole.MENTOR && auth.id !== this.id) throw Error('Unauthorized.');
    
    if (!this.files) {
      this.files = await Container.get(PrismaClient).file.findMany({
        where: { mentorId: this.id },
      });
    }
    return this.files;
  }
}
