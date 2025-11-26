import { ObjectType, Field, Ctx } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { JSONSchema7 } from 'json-schema';
import { Container } from 'typedi';
import { PrismaClient, Event as PrismaEvent, SurveyOccurence as PrismaSurveyOccurence } from '@prisma/client';
import { PersonType } from '../enums';
import { Event } from './Event';
import { SurveyOccurence } from './SurveyOccurence';
import { Context } from '../context';

@ObjectType()
export class Survey {
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  intro: string;

  @Field(() => Boolean)
  randomize: boolean

  @Field(() => PersonType)
  personType: PersonType;

  @Field(() => GraphQLJSONObject, { nullable: true })
  selfSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  selfUi?: Record<string, unknown>

  @Field(() => String, { nullable: true })
  selfCaution?: string

  @Field(() => String, { nullable: true })
  selfDisplay?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  peerCaution?: string

  @Field(() => String, { nullable: true })
  peerDisplay?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  menteeCaution?: string

  @Field(() => String, { nullable: true })
  menteeDisplay?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  mentorSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  mentorUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  mentorShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  mentorCaution?: string

  @Field(() => String, { nullable: true })
  mentorDisplay?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  projectCaution?: string

  @Field(() => String, { nullable: true })
  projectDisplay?: string

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

  surveyOccurences?: PrismaSurveyOccurence[];

  @Field(() => [SurveyOccurence], { name: 'occurrences' })
  async fetchOccurrences(
    @Ctx() { auth }: Context,
  ): Promise<PrismaSurveyOccurence[]> {
    if (!this.surveyOccurences) {
      this.surveyOccurences = (await Container.get(PrismaClient).surveyOccurence.findMany({
        where: {
          surveyId: this.id,
          visibleAt: auth.isAdmin ? {} : { lte: new Date() },
        },
      }))!;
    }

    return this.surveyOccurences;
  }
}
