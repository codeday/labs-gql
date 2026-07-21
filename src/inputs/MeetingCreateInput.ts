import { InputType, Field } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';

@InputType()
export class MeetingCreateInput {
  @Field(() => String)
  eventId: string

  @Field(() => String, { nullable: true })
  projectId?: string

  @Field(() => Date)
  visibleAt: Date

  @Field(() => Date)
  dueAt: Date

  @Field(() => Date, { nullable: true })
  scheduledStartAt?: Date

  @Field(() => Date, { nullable: true })
  scheduledEndAt?: Date

  @Field(() => GraphQLJSONObject, { nullable: true })
  agendaStudentSchema?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  agendaStudentUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  notesStudentSchema?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  notesStudentUi?: Record<string, unknown>

  @Field(() => String, { nullable: true })
  slackHuddleId?: string
}
