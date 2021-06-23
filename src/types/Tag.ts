import { Tag as PrismaTag } from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import { TagType } from '../enums';

@ObjectType()
export class Tag implements PrismaTag {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  mentorDisplayName: string

  @Field(() => String)
  studentDisplayName: string

  @Field(() => String, { nullable: true })
  trainingLink: string | null

  @Field(() => TagType)
  type: TagType
}
