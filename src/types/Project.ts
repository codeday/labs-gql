import {
  Mentor as PrismaMentor,
  Project as PrismaProject,
  Tag as PrismaTag,
  Student as PrismaStudent,
  Event as PrismaEvent,
  Partner as PrismaPartner,
  SurveyResponse as PrismaSurveyResponse,
  Repository as PrismaRepository,
  Artifact as PrismaArtifact,
  PrismaClient,
  Prisma,
} from '@prisma/client';
import { Container } from 'typedi';
import {
  ObjectType, Field, Int, Authorized, Ctx,
} from 'type-graphql';
import { Track, ProjectStatus } from '../enums';
import { Tag } from './Tag';
import { Mentor } from './Mentor';
import { Student } from './Student';
import { Event } from './Event';
import { SurveyResponse } from './SurveyResponse';
import { Partner } from './Partner';
import { Repository } from './Repository';
import { Artifact } from './Artifact';
import { AuthRole, Context } from '../context';

@ObjectType()
export class Project implements PrismaProject {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String, { nullable: true })
  description: string | null

  @Field(() => String, { nullable: true })
  deliverables: string | null

  @Field(() => Track)
  track: Track

  @Field(() => Int)
  maxStudents: number

  @Field(() => String, { nullable: true })
  issueUrl: string | null

  @Field(() => Boolean)
  complete: boolean

  @Field(() => ProjectStatus)
  status: ProjectStatus

  tags: PrismaTag[]

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  slackChannelId: string | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  standupId: string | null

  @Field(() => [Tag], { name: 'tags' })
  async fetchTags(): Promise<PrismaTag[]> {
    if (!this.tags) {
      this.tags = await Container.get(PrismaClient).tag.findMany({ where: { projects: { some: { id: this.id } } } });
    }
    return this.tags;
  }

  mentors: PrismaMentor[]

  @Field(() => [Mentor], { name: 'mentors' })
  async fetchMentors(): Promise<PrismaMentor[]> {
    if (!this.mentors) {
      this.mentors = await Container.get(PrismaClient).mentor.findMany({
        where: { projects: { some: { id: this.id } } },
      });
    }
    return this.mentors;
  }

  students?: PrismaStudent[] | null

  @Field(() => [Student], { name: 'students' })
  async fetchStudents(): Promise<PrismaStudent[]> {
    if (!this.students) {
      this.students = await Container.get(PrismaClient).student.findMany({
        where: { projects: { some: { id: this.id } } },
      });
    }
    return this.students;
  }

  @Field(() => String, { nullable: true })
  eventId: string | null;

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event', nullable: true })
  async fetchEvent(): Promise<PrismaEvent | null> {
    if (!this.event && this.eventId) {
      this.event = (await Container.get(PrismaClient).event.findUnique({ where: { id: this.eventId } }))!;
    }

    return this.event ?? null;
  }

  @Field(() => String, { nullable: true })
  repositoryId: string | null;

  repository?: PrismaRepository | null;

  @Field(() => Repository, { name: 'repository', nullable: true })
  async fetchRepository(): Promise<PrismaRepository | null> {
    if (!this.repositoryId) return null;
    if (!this.repository) {
      this.repository = (await Container.get(PrismaClient).repository.findUnique({ where: { id: this.repositoryId } }))!;
    }

    return this.repository;
  }

  artifacts?: PrismaArtifact[] | null

  @Field(() => [Artifact], { name: 'artifacts' })
  async fetchArtifacts(
    @Ctx() { auth }: Context,
  ): Promise<PrismaArtifact[]> {
    if (!this.artifacts) {
      let artifactsWhere: Prisma.ArtifactWhereInput = {
        [auth.personType === 'MENTOR' ? 'mentorId': 'studentId']: auth.id
      };
      if (auth.isAdmin) artifactsWhere = {};
      else if (auth.isPartner) artifactsWhere = {
        student: { partnerCode: auth.partnerCode! },
      };
      this.artifacts = await Container.get(PrismaClient).artifact.findMany({
        where: {
          project: { id: this.id },
          OR: [
            artifactsWhere,
            { mentorId: null, studentId: null },
          ],
        },
      });
    }
    return this.artifacts;
  }

  @Field(() => String, { nullable: true })
  affinePartnerId: string | null;

  affinePartner?: PrismaPartner;

  @Field(() => Partner, { name: 'affinePartner', nullable: true })
  async fetchAffinePartner(): Promise<PrismaPartner | null> {
    if (!this.affinePartnerId) return null;
    if (!this.affinePartner) {
      this.affinePartner = (
        await Container.get(PrismaClient)
          .partner
          .findUnique({ where: { id: this.affinePartnerId } })
      )!;
    }

    return this.affinePartner;
  }

  @Field(() => Number)
  async studentCount(): Promise<number> {
    return (await this.fetchStudents()).length;
  }


  surveyResponsesAbout?: PrismaSurveyResponse[]

  @Authorized([AuthRole.ADMIN, AuthRole.MANAGER])
  @Field(() => [SurveyResponse], { name: 'surveyResponsesAbout' })
  async fetchSurveyResponsesAbout(): Promise<PrismaSurveyResponse[]> {
    if (!this.surveyResponsesAbout) {
      this.surveyResponsesAbout = (await Container.get(PrismaClient).surveyResponse.findMany({
        where: { projectId: this.id, surveyOccurence: { survey: { internal: false } } },
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
