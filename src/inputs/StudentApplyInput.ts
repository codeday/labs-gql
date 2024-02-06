import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-type-json';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { StudentStatus, Track } from '../enums';
import { uploadResume } from '../utils';

@InputType()
export class StudentApplyInput {
  @Field(() => String)
  givenName: string

  @Field(() => String)
  surname: string

  @Field(() => String)
  email: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  // eslint-disable-next-line @typescript-eslint/ban-types
  profile?: object

  @Field(() => Track)
  track: Track

  @Field(() => Int)
  minHours: number

  @Field(() => String, { nullable: true })
  partnerCode?: string

  @Field(() => [String], { nullable: true })
  tags?: string[]

  @Field(() => String, { nullable: true })
  timezone?: string

  @Field(() => GraphQLUpload, { nullable: true })
  resume?: FileUpload

  async toQuery(): Promise<Omit<Prisma.StudentCreateInput, 'username'>> {
    const resumeUrl = this.resume
      ? await uploadResume(this.resume)
      : null;

    return {
      givenName: this.givenName,
      surname: this.surname,
      email: this.email,
      profile: this.profile || {},
      status: StudentStatus.APPLIED,
      track: this.track,
      minHours: this.minHours,
      partnerCode: this.partnerCode,
      timezone: this.timezone,
      tags: this.tags ? { connect: this.tags.map((id): Prisma.TagWhereUniqueInput => ({ id })) } : undefined,
      resumeUrl,
    };
  }
}
