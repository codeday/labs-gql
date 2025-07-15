import { Field, ID, ObjectType } from 'type-graphql';
import { Event } from './Event';

@ObjectType()
export class ScheduledAnnouncement {
  @Field(() => ID)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => Date)
  sendAt: Date;

  @Field({ nullable: true })
  subject?: string;

  @Field(() => String)
  body: string;

  @Field(() => String)
  medium: string;

  @Field(() => String)
  target: string;

  @Field(() => Boolean)
  isSent: boolean;

  @Field(() => String)
  eventId: string;

  @Field(() => Event)
  event: Event;
}
