import { ObjectType, Field, Authorized, Ctx, Int } from 'type-graphql';
import { AuthRole, Context } from '../context';
import { GraphQLJSONObject } from 'graphql-type-json';
import { JSONSchema7 } from 'json-schema';
import Container from 'typedi';
import { PrismaClient, ArtifactType as PrismaArtifactType, FileType as PrismaFileType } from '@prisma/client';
import { ArtifactType } from './ArtifactType';
import { FileType } from './FileType';

@ObjectType()
export class Event {
  @Field(() => String)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => String)
  slug: string

  @Field(() => String)
  name: string;

  @Field(() => Int)
  defaultWeeks: number

  @Field(() => [String])
  certificationStatements: string

  @Field(() => Boolean)
  hasBeginner: boolean

  @Field(() => Boolean)
  hasIntermediate: boolean

  @Field(() => Boolean)
  hasAdvanced: boolean

  @Field(() => Boolean)
  partnersOnly: boolean

  @Field(() => Date)
  studentApplicationsStartAt: Date;

  @Field(() => Date)
  mentorApplicationsStartAt: Date;

  @Field(() => Date)
  studentApplicationsEndAt: Date;

  @Field(() => Date)
  mentorApplicationsEndAt: Date;

  @Field(() => Date, { nullable: true })
  matchingStartsAt?: Date

  @Field(() => Date, { nullable: true })
  matchingDueAt?: Date

  @Field(() => Date, { nullable: true })
  matchingEndsAt?: Date;

  @Field(() => Boolean)
  matchPreferenceSubmissionOpen: boolean;

  @Field(() => Date)
  startsAt: Date;

  @Field(() => Date, { nullable: true })
  projectWorkStartsAt?: Date;


  @Authorized([AuthRole.ADMIN])
  @Field(() => String)
  matchingAlgorithm: string;

  @Authorized([AuthRole.ADMIN])
  @Field(() => String)
  emailTemplate: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => String, { nullable: true })
  slackWorkspaceId?: string

  @Field(() => String, { nullable: true })
  slackUserGroupId: string | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  slackWorkspaceAccessToken: string | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  standupAndProsperToken: string | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  contractSchema?: JSONSchema7
  
  @Field(() => GraphQLJSONObject, { nullable: true })
  contractUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  mentorApplicationSchema?: JSONSchema7
  
  @Field(() => GraphQLJSONObject, { nullable: true })
  mentorApplicationUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  studentApplicationSchema?: JSONSchema7
  
  @Field(() => GraphQLJSONObject, { nullable: true })
  studentApplicationUi?: Record<string, unknown>

  @Field(() => Boolean)
  async iAmMentor(
    @Ctx() { auth }: Context,
  ): Promise<boolean> {
    if (!(auth.isAuthenticated || auth.isUnspecified)) return false;
    return (await Container.get(PrismaClient)
      .mentor.count({ where: { ...auth.toWhereMany()!, eventId: this.id } })) > 0;
  }

  @Field(() => Boolean)
  async iAmStudent(
    @Ctx() { auth }: Context,
  ): Promise<boolean> {
    if (!(auth.isAuthenticated || auth.isUnspecified)) return false;
        return (await Container.get(PrismaClient)
      .student.count({ where: { ...auth.toWhereMany()!, eventId: this.id } })) > 0;
  }

  artifactTypes?: PrismaArtifactType[] | null

  @Field(() => [ArtifactType], { name: 'artifactTypes' })
  async fetchArtifactTypes(): Promise<PrismaArtifactType[]> {
    if (!this.artifactTypes) {
      this.artifactTypes = await Container.get(PrismaClient).artifactType.findMany({
        where: { event: { id: this.id } },
      });
    }
    return this.artifactTypes;
  }

  fileTypes?: PrismaFileType[] | null

  @Field(() => [FileType], { name: 'fileTypes' })
  async fetchFileTypes(): Promise<PrismaFileType[]> {
    if (!this.fileTypes) {
      this.fileTypes = await Container.get(PrismaClient).fileType.findMany({
        where: { eventId: this.id },
      });
    }
    return this.fileTypes;
  }
}
