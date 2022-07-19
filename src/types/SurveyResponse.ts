import { ObjectType, Field } from 'type-graphql';
import { Container } from 'typedi';
import { GraphQLJSONObject } from 'graphql-type-json';
import {
  PrismaClient,
  SurveyOccurence as PrismaSurveyOccurence,
  Mentor as PrismaMentor,
  Student as PrismaStudent,
  Project as PrismaProject,
} from '@prisma/client';
import { SurveyOccurence } from './SurveyOccurence';
import { Student } from './Student';
import { Mentor } from './Mentor';
import { Project } from './Project';

@ObjectType()
export class SurveyResponse {
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  @Field(() => GraphQLJSONObject)
  response: Record<string, unknown>

  @Field(() => Number)
  caution: number

  @Field(() => String)
  surveyOccurenceId: string

  surveyOccurence: PrismaSurveyOccurence

  @Field(() => SurveyOccurence, { name: 'surveyOccurence' })
  async fetchSurveyOccurence(): Promise<PrismaSurveyOccurence> {
    if (!this.surveyOccurence) {
      this.surveyOccurence = (await Container.get(PrismaClient).surveyOccurence.findUnique({
        where: { id: this.surveyOccurenceId },
        include: { survey: true },
      }))!;
    }
    return this.surveyOccurence;
  }

  @Field(() => String, { nullable: true })
  authorStudentId?: string

  authorStudent?: PrismaStudent

  @Field(() => Student, { nullable: true, name: 'authorStudent' })
  async fetchAuthorStudent(): Promise<PrismaStudent | undefined> {
    if (!this.authorStudent && this.authorStudentId) {
      this.authorStudent = (await Container.get(PrismaClient).student.findUnique({
        where: { id: this.authorStudentId },
      })) || undefined;
    }
    return this.authorStudent;
  }

  @Field(() => String, { nullable: true })
  authorMentorId?: string

  authorMentor?: PrismaMentor

  @Field(() => Mentor, { nullable: true, name: 'authorMentor' })
  async fetchAuthorMentor(): Promise<PrismaMentor | undefined> {
    if (!this.authorMentor && this.authorMentorId) {
      this.authorMentor = (await Container.get(PrismaClient).mentor.findUnique({
        where: { id: this.authorMentorId },
      })) || undefined;
    }
    return this.authorMentor;
  }

  @Field(() => String, { nullable: true })
  studentId?: string

  student?: PrismaStudent

  @Field(() => Student, { nullable: true, name: 'student' })
  async fetchStudent(): Promise<PrismaStudent | undefined> {
    if (!this.student && this.studentId) {
      this.student = (await Container.get(PrismaClient).student.findUnique({
        where: { id: this.studentId },
      })) || undefined;
    }
    return this.student;
  }

  @Field(() => String, { nullable: true })
  mentorId?: string

  mentor?: PrismaMentor

  @Field(() => Mentor, { nullable: true, name: 'mentor' })
  async fetchMentor(): Promise<PrismaMentor | undefined> {
    if (!this.mentor && this.mentorId) {
      this.mentor = (await Container.get(PrismaClient).mentor.findUnique({
        where: { id: this.mentorId },
      })) || undefined;
    }
    return this.mentor;
  }

  @Field(() => String, { nullable: true })
  projectId?: string

  project?: PrismaProject

  @Field(() => Project, { nullable: true, name: 'project' })
  async fetchProject(): Promise<PrismaProject | undefined> {
    if (!this.project && this.projectId) {
      this.project = (await Container.get(PrismaClient).project.findUnique({
        where: { id: this.projectId },
      })) || undefined;
    }
    return this.project;
  }
}
