import { ObjectType, Field } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { JSONSchema7 } from 'json-schema';
import { Container } from 'typedi';
import { PrismaClient, Event as PrismaEvent } from '@prisma/client';
import { PersonType } from '../enums';
import { Event } from './Event';

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

  @Field(() => PersonType)
  personType: PersonType;

  @Field(() => GraphQLJSONObject, { nullable: true })
  selfSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  selfUi?: Record<string, unknown>

  @Field(() => String, { nullable: true })
  selfCaution?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  peerShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  peerCaution?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  menteeShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  menteeCaution?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectSchema?: JSONSchema7

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectUi?: Record<string, unknown>

  @Field(() => GraphQLJSONObject, { nullable: true })
  projectShare?: Record<string, string>

  @Field(() => String, { nullable: true })
  projectCaution?: string

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
}
