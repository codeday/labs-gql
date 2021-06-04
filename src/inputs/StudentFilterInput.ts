import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { StudentStatus } from '../enums';

@InputType()
export class StudentFilterInput {
  @Field(() => StudentStatus, { nullable: true })
  inStatus?: StudentStatus

  @Field(() => Boolean, { nullable: true })
  withProjects?: boolean

  @Field(() => String, { nullable: true })
  partnerCode?: string

  @Field(() => String, { nullable: true })
  givenName?: string

  @Field(() => String, { nullable: true })
  surname?: string

  @Field(() => String, { nullable: true })
  email?: string

  toQuery(): Prisma.StudentWhereInput {
    return {
      status: this.inStatus,
      partnerCode: this.partnerCode,
      projects: this.withProjects ? { some: {} } : undefined,
      givenName: this.givenName,
      surname: this.surname,
      email: this.email,
    };
  }
}
