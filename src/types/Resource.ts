import {
  Student as PrismaStudent,
  Event as PrismaEvent,
  Resource as PrismaResource,
  PrismaClient
} from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import { Event } from './Event';
import Container from 'typedi';

@ObjectType()
export class Resource implements PrismaResource {
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

  @Field(() => Boolean)
  displayToMentors: boolean

  @Field(() => Boolean)
  displayToStudents: boolean

  @Field(() => Boolean)
  displayToPartners: boolean

  @Field(() => Boolean)
  displayToManagers: boolean

  @Field(() => String)
  eventId: string;

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUnique({ where: { id: this.eventId } }))!;
    }

    return this.event;
  }

}
