import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { TagType } from '../enums';

@InputType()
export class TagEditInput {
  @Field(() => String, { nullable: true })
  mentorDisplayName?: string

  @Field(() => String, { nullable: true })
  studentDisplayName?: string

  @Field(() => String, { nullable: true })
  trainingLink?: string

  @Field(() => TagType, { nullable: true })
  type?: TagType

  toQuery(): Prisma.TagUpdateInput {
    return {
      mentorDisplayName: this.mentorDisplayName,
      studentDisplayName: this.studentDisplayName,
      trainingLink: this.trainingLink,
      type: this.type,
    };
  }
}
