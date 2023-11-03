import {
  Prisma,
  Project as PrismaProject,
  Mentor as PrismaMentor,
  Event as PrismaEvent,
  SurveyResponse as PrismaSurveyResponse,
  PrismaClient,
} from '@prisma/client';
import {
  ObjectType, Field, Authorized, Arg, Int,
} from 'type-graphql';
import GraphQLJSON from 'graphql-type-json';
import Container from 'typedi';
import { MentorStatus } from '../enums';
import { AuthRole } from '../context';
import { Project } from './Project';
import { SurveyResponse } from './SurveyResponse';
import { Event } from './Event';

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
}
