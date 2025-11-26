import {
  Artifact as PrismaArtifact,
  Student as PrismaStudent,
  Mentor as PrismaMentor,
  Project as PrismaProject,
  ArtifactType as PrismaArtifactType,
  PrismaClient
} from '@prisma/client';
import { ObjectType, Field, Int } from 'type-graphql';
import Container from 'typedi';
import { Project } from './Project';
import { Mentor } from './Mentor';
import { Student } from './Student';
import { ArtifactType } from './ArtifactType';

@ObjectType()
export class Artifact implements PrismaArtifact {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  name: string

  @Field(() => String)
  link: string

  @Field(() => String, { nullable: true })
  studentId: string | null

  student?: PrismaStudent

  @Field(() => Student, { nullable: true, name: 'student' })
  async fetchStudent(): Promise<PrismaStudent | undefined | null> {
    if (!this.studentId) return null;
    if (!this.student) {
      this.student = (await Container.get(PrismaClient).student.findUniqueOrThrow({
        where: { id: this.studentId },
      })) || undefined;
    }
    return this.student;
  }

  @Field(() => String, { nullable: true })
  mentorId: string | null

  mentor?: PrismaMentor

  @Field(() => Mentor, { nullable: true, name: 'mentor' })
  async fetchMentor(): Promise<PrismaMentor | undefined | null> {
    if (!this.mentorId) return null;
    if (!this.mentor) {
      this.mentor = (await Container.get(PrismaClient).mentor.findUniqueOrThrow({
        where: { id: this.mentorId },
      })) || undefined;
    }
    return this.mentor;
  }

  @Field(() => String)
  projectId: string

  project?: PrismaProject

  @Field(() => Project, { name: 'project' })
  async fetchProject(): Promise<PrismaProject> {
    if (!this.project) {
      this.project = (await Container.get(PrismaClient).project.findUniqueOrThrow({
        where: { id: this.projectId },
      })) || undefined;
    }
    return this.project!;
  }

  @Field(() => String, { nullable: true })
  artifactTypeId: string | null

  artifactType?: PrismaArtifactType

  @Field(() => ArtifactType, { name: 'artifactType' })
  async fetchArtifactType(): Promise<PrismaArtifactType | null> {
    if (!this.artifactTypeId) return null;
    if (!this.artifactType) {
      this.artifactType = (await Container.get(PrismaClient).artifactType.findUniqueOrThrow({
        where: { id: this.artifactTypeId }
      }));
    }
    return this.artifactType!;
  }
}
