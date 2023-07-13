import {
  Mentor as PrismaMentor,
  Project as PrismaProject,
  Tag as PrismaTag,
  Student as PrismaStudent,
  Event as PrismaEvent,
  Partner as PrismaPartner,
  SurveyResponse as PrismaSurveyResponse,
  PrismaClient,
} from '@prisma/client';
import { Container } from 'typedi';
import {
  ObjectType, Field, Int, Authorized,
} from 'type-graphql';
import { Track, ProjectStatus } from '../enums';
import { Tag } from './Tag';
import { Mentor } from './Mentor';
import { Student } from './Student';
import { Event } from './Event';
import { SurveyResponse } from './SurveyResponse';
import { Partner } from './Partner';
import { AuthRole } from '../context';

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

  @Field(() => ProjectStatus)
  status: ProjectStatus

  tags: PrismaTag[]

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

  @Field(() => String)
  eventId: string;

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUnique({ where: { id: this.id } }))!;
    }

    return this.event;
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
        include: { surveyOccurence: { include: { survey: true } } },
      }));
    }

    return this.surveyResponsesAbout;
  }

}
