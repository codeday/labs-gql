import { ObjectType, Field, Int, Float } from 'type-graphql';
import { Student } from './Student';
import { Mentor } from './Mentor';
import { Project } from './Project';
import { AttendanceSource, AttendanceTrackingMode } from '../enums';

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

  // Distinguishes "did not attend" from "this team is not measured", so untracked
  // teams are not read as 0% attendance.
  @Field(() => AttendanceTrackingMode)
  trackingMode: AttendanceTrackingMode
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
