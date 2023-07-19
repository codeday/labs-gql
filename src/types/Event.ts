import { ObjectType, Field, Authorized } from 'type-graphql';
import { AuthRole } from '../context';

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
}
