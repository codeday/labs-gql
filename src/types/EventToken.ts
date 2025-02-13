import { ObjectType, Field } from 'type-graphql';
import { Event } from './Event';
import { Event as PrismaEvent } from '@prisma/client';

@ObjectType()
export class EventToken {
  @Field(() => Event)
  event: PrismaEvent

  @Field(() => String)
  token: string
}
