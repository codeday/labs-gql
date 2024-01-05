import { Prisma } from "@prisma/client";
import { GraphQLJSONObject } from "graphql-type-json";
import { Field, InputType, Int } from "type-graphql";

@InputType()
export class EventEditInput {

  @Field(() => String, { nullable: true })
  name?: string | null

  @Field(() => String, { nullable: true })
  emailSignature?: string | null

  @Field(() => String, { nullable: true })
  title?: string | null

  @Field(() => Int, { nullable: true })
  defaultWeeks?: number | null

  @Field(() => [String], { nullable: true })
  certificationStatements?: string[] | null

  @Field(() => Boolean, { nullable: true })
  hasBeginner?: boolean | null

  @Field(() => Boolean, { nullable: true })
  hasIntermediate?: boolean | null

  @Field(() => Boolean, { nullable: true })
  hasAdvanced?: boolean | null

  @Field(() => Date, { nullable: true })
  studentApplicationsStartAt?: Date | null

  @Field(() => Date, { nullable: true })
  studentApplicationsEndAt?: Date | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  studentApplicationSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  studentApplicationUi?: object

  @Field(() => Date, { nullable: true })
  mentorApplicationsStartAt?: Date | null

  @Field(() => Date, { nullable: true })
  mentorApplicationsEndAt?: Date | null

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  mentorApplicationSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  mentorApplicationUi?: object

  @Field(() => Boolean, { nullable: true })
  matchPreferenceSubmissionOpen?: boolean | null

  @Field(() => Boolean, { nullable: true })
  matchComplete?: boolean | null

  @Field(() => Boolean, { nullable: true })
  partnersOnly?: boolean | null

  @Field(() => String, { nullable: true })
  slackWorkspaceId?: string | null

  @Field(() => String, { nullable: true })
  slackWorkspaceAccessToken?: string | null

  public toQuery(): Prisma.EventUpdateInput {
    return {
      name: this.name ?? undefined,
      emailSignature: this.emailSignature ?? undefined,
      title: this.title ?? undefined,

      defaultWeeks: this.defaultWeeks ?? undefined,
      certificationStatements: this.certificationStatements ?? undefined,
      hasBeginner: this.hasBeginner ?? undefined,
      hasIntermediate: this.hasIntermediate ?? undefined,
      hasAdvanced: this.hasAdvanced ?? undefined,

      studentApplicationsStartAt: this.studentApplicationsStartAt ?? undefined,
      studentApplicationsEndAt: this.studentApplicationsEndAt ?? undefined,
      studentApplicationSchema: this.studentApplicationSchema ?? undefined,
      studentApplicationUi: this.studentApplicationUi ?? undefined,

      mentorApplicationsStartAt: this.mentorApplicationsStartAt ?? undefined,
      mentorApplicationsEndAt: this.mentorApplicationsEndAt ?? undefined,
      mentorApplicationSchema: this.mentorApplicationSchema ?? undefined,
      mentorApplicationUi: this.mentorApplicationUi ?? undefined,

      matchPreferenceSubmissionOpen: this.matchPreferenceSubmissionOpen ?? undefined,
      matchComplete: this.matchComplete ?? undefined,
      partnersOnly: this.partnersOnly ?? undefined,
      slackWorkspaceId: this.slackWorkspaceId ?? undefined,
      slackWorkspaceAccessToken: this.slackWorkspaceAccessToken ?? undefined,
    };
  }
}