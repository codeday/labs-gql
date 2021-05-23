import { Prisma, Student as PrismaStudent } from '@prisma/client';
import { ObjectType, Field, Authorized } from 'type-graphql';
import GraphQLJSON from 'graphql-type-json';
import { DateTime } from 'luxon';
import { StudentStatus, RejectionReason, Track } from '../enums';
import { AuthRole } from '../context';

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

  @Authorized(AuthRole.ADMIN)
  @Field(() => RejectionReason, { nullable: true })
  rejectionReason: RejectionReason | null

  @Field(() => GraphQLJSON)
  profile: Prisma.JsonValue

  @Field(() => Number)
  weeks: number

  @Field(() => Boolean)
  hasValidAdmissionOffer(): boolean {
    return this.status === 'OFFERED' && (!this.offerDate || DateTime.fromJSDate(this.offerDate).diffNow().days <= 3);
  }

  @Authorized(AuthRole.ADMIN)
  @Field(() => Date, { nullable: true })
  offerDate: Date | null

  @Authorized(AuthRole.ADMIN)
  @Field(() => Number, { nullable: true })
  admissionAverageRating: number | null;
}
