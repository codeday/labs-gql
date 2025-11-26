import {
  Student as PrismaStudent,
  Event as PrismaEvent,
  Note as PrismaNote,
  PrismaClient
} from '@prisma/client';
import { ObjectType, Field, Float } from 'type-graphql';
import { Student } from './Student';
import { Event } from './Event';
import Container from 'typedi';

@ObjectType()
export class Note implements PrismaNote {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  note: string

  @Field(() => String)
  username: string

  @Field(() => Float)
  caution: number

  @Field(() => String, { nullable: true })
  studentId: string

  student?: PrismaStudent

  @Field(() => Student, { nullable: true, name: 'student' })
  async fetchStudent(): Promise<PrismaStudent | undefined> {
    if (!this.student) {
      this.student = (await Container.get(PrismaClient).student.findUniqueOrThrow({
        where: { id: this.studentId },
      })) || undefined;
    }
    return this.student;
  }

  @Field(() => String)
  eventId: string;

  event?: PrismaEvent;

  @Field(() => Event, { name: 'event' })
  async fetchEvent(): Promise<PrismaEvent> {
    if (!this.event) {
      this.event = (await Container.get(PrismaClient).event.findUniqueOrThrow({ where: { id: this.eventId } }))!;
    }

    return this.event;
  }

}
