import { ObjectType, Field, Int, Float } from 'type-graphql';
import { Student } from './Student';
import { Mentor } from './Mentor';
import { Project } from './Project';
import { AttendanceSource } from '../enums';

@ObjectType()
export class StudentAttendanceStat {
  @Field(() => Student)
  student: Student

  @Field(() => Project, { nullable: true })
  project?: Project

  @Field(() => Int)
  meetingsTotal: number

  @Field(() => Int)
  meetingsAttended: number

  @Field(() => Float)
  attendancePercentage: number

  @Field(() => Date, { nullable: true })
  lastAttendedAt?: Date

  @Field(() => Date, { nullable: true })
  lastMeetingAt?: Date

  @Field(() => Boolean)
  isFlagged: boolean

  @Field(() => [AttendanceSource])
  dataSources: AttendanceSource[]
}

@ObjectType()
export class MentorReflectionStat {
  @Field(() => Mentor)
  mentor: Mentor

  @Field(() => Project, { nullable: true })
  project?: Project

  @Field(() => Int)
  expectedReflections: number

  @Field(() => Int)
  submittedReflections: number

  @Field(() => Float)
  completionPercentage: number

  @Field(() => Date, { nullable: true })
  lastSubmittedAt?: Date

  @Field(() => Boolean)
  isFlagged: boolean
}

@ObjectType()
export class FlaggedStudent {
  @Field(() => Student)
  student: Student

  @Field(() => Mentor, { nullable: true })
  mentor?: Mentor

  @Field(() => Project, { nullable: true })
  project?: Project

  @Field(() => String)
  reason: string

  @Field(() => Float)
  attendancePercentage: number

  @Field(() => Int)
  missedMeetings: number

  @Field(() => Date, { nullable: true })
  lastAttendedAt?: Date
}
