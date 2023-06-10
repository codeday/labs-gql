import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { Track } from '../enums';

@InputType()
export class PartnerEditInput {
  @Field(() => String)
  partnerCode: string

  @Field(() => Int, { nullable: true })
  weeks?: number

  @Field(() => Int, { nullable: true })
  minHours?: number

  @Field(() => [String], { nullable: true })
  forceTags?: string[]

  @Field(() => [String], { nullable: true })
  forbidTags?: string[]

  toQuery(): Prisma.PartnerUpdateInput {
    return {
      partnerCode: this.partnerCode,
      weeks: this.weeks,
      minHours: this.minHours,
      forceTags: this.forceTags
        ? { set: this.forceTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
      forbidTags: this.forbidTags
        ? { set: this.forbidTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
    };
  }
}
