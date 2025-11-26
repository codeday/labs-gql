import {
  Partner as PrismaPartner,
  Tag as PrismaTag,
  Student as PrismaStudent,
  Event as PrismaEvent,
  Project as PrismaProject,
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
import { Project } from './Project';
import { AuthRole, JwtToken } from '../context';
import { sign } from 'jsonwebtoken';
import config from '../config';
import { GraphQLJSONObject } from 'graphql-type-json';
import { JSONSchema7 } from 'json-schema';

@ObjectType()
export class Partner {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  partnerCode: string

  @Field(() => Int, { nullable: true })
  weeks: number | null

  @Field(() => Int, { nullable: true })
  minHours: number | null

  @Field(() => Boolean)
  skipPreferences: boolean

  @Field(() => Boolean)
  onlyAffine: boolean

  @Field(() => Boolean)
  autoApprove: boolean

  @Field(() => GraphQLJSONObject, { nullable: true })
  contractSchema?: JSONSchema7
  
  @Field(() => GraphQLJSONObject, { nullable: true })
  contractUi?: Record<string, unknown>

  forceTags?: PrismaTag[] | null

  @Field(() => [Tag], { name: 'forceTags' })
  async fetchForceTags(): Promise<PrismaTag[]> {
    if (!this.forceTags) {
      this.forceTags = await Container.get(PrismaClient)
        .tag
        .findMany({
          where: { forcedPartners: { some: { id: this.id } } }
        });
    }
    return this.forceTags;
  }

  forbidTags?: PrismaTag[] | null

  @Field(() => [Tag], { name: 'forbidTags' })
  async fetchForbidTags(): Promise<PrismaTag[]> {
    if (!this.forceTags) {
      this.forceTags = await Container.get(PrismaClient)
        .tag
        .findMany({
          where: { forbiddenPartners: { some: { id: this.id } } }
        });
    }
    return this.forceTags;
  }


  affineProjects?: PrismaProject[] | null

  @Field(() => [Project], { name: 'affineProjects' })
  async fetchAffineProjects(): Promise<PrismaProject[]> {
    if (!this.affineProjects) {
      this.affineProjects = await Container.get(PrismaClient)
        .project
        .findMany({
          where: { affinePartnerId: this.id }
        });
    }
    return this.affineProjects;
  }

  students?: PrismaStudent[] | null

  @Field(() => [Student], { name: 'students' })
  async fetchStudents(): Promise<PrismaStudent[]> {
    if (!this.students) {
      this.students = await Container.get(PrismaClient).student.findMany({
        where: {
          partnerCode: this.partnerCode,
          eventId: this.eventId,
        },
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

  @Field(() => Number)
  async studentCount(): Promise<number> {
    return await Container.get(PrismaClient).student.count({
        where: {
          partnerCode: this.partnerCode,
          eventId: this.eventId,
          status: { notIn: [ 'CANCELED', 'REJECTED' ]},
        },
      });
  }

  @Authorized(AuthRole.ADMIN)
  @Field(() => String)
  token(): string {
    const token: JwtToken = {
      typ: AuthRole.PARTNER,
      evt: this.eventId,
      pc: this.partnerCode,
    };
    return sign(token, config.auth.secret, { audience: config.auth.audience });
  }
}
