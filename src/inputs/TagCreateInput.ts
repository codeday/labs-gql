import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { TagType } from '../enums';

@InputType()
export class TagCreateInput {
  @Field(() => String)
  id: string

  @Field(() => String)
  mentorDisplayName: string

  @Field(() => String)
  studentDisplayName: string

  @Field(() => TagType)
  type: TagType

  toQuery(): Prisma.TagCreateInput {
    return {
      id: this.id,
      mentorDisplayName: this.mentorDisplayName,
      studentDisplayName: this.studentDisplayName,
      type: this.type,
    };
  }
}
