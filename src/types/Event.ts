import { ObjectType, Field, Authorized, Ctx } from 'type-graphql';
import { AuthRole, Context } from '../context';
import { GraphQLJSONObject } from 'graphql-type-json';
import { JSONSchema7 } from 'json-schema';
import Container from 'typedi';
import { PrismaClient, ArtifactType as PrismaArtifactType } from '@prisma/client';
import { ArtifactType } from './ArtifactType';

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

  @Field(() => Date)
  studentApplicationsStartAt: Date;

  @Field(() => Date)
  mentorApplicationsStartAt: Date;

  @Field(() => Date)
  studentApplicationsEndAt: Date;

  @Field(() => Date)
  mentorApplicationsEndAt: Date;

  @Field(() => Boolean)
  matchPreferenceSubmissionOpen: boolean;

  @Field(() => Date)
  startsAt: Date;

  @Field(() => String)
  matchingAlgorithm: string;

  @Field(() => String)
  emailTemplate: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  slackWorkspaceId?: string

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  slackUserGroupId: string | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  slackWorkspaceAccessToken: string | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => String, { nullable: true })
  standupAndProsperToken: string | null

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
}
