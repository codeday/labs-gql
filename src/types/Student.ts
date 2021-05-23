import { Prisma, Student as PrismaStudent } from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import GraphQLJSON from 'graphql-type-json';
import { StudentStatus, RejectionReason, Track } from '../enums';

@ObjectType()
export class Student implements PrismaStudent {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  username: string

  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => StudentStatus)
  status: StudentStatus

  @Field(() => Track)
  track: Track

  @Field(() => RejectionReason, { nullable: true })
  rejectionReason: RejectionReason | null

  @Field(() => GraphQLJSON)
  profile: Prisma.JsonValue

  @Field(() => Number)
  weeks: number

  @Field(() => Date, { nullable: true })
  offerDate: Date | null
}
