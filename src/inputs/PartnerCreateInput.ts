import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { Track } from '../enums';

@InputType()
export class PartnerCreateInput {
  @Field(() => String)
  partnerCode: string

  @Field(() => Int, { nullable: true })
  weeks?: number

  @Field(() => Int, { nullable: true })
  minHours?: number

  @Field(() => Boolean, { nullable: true })
  skipPreferences?: boolean

  @Field(() => [String], { nullable: true })
  forceTags?: string[]

  @Field(() => [String], { nullable: true })
  forbidTags?: string[]

  toQuery(): Omit<Prisma.PartnerCreateInput, 'event'> {
    return {
      partnerCode: this.partnerCode,
      weeks: this.weeks,
      minHours: this.minHours,
      skipPreferences: this.skipPreferences,
      forceTags: this.forceTags
        ? { connect: this.forceTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
      forbidTags: this.forbidTags
        ? { connect: this.forbidTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
    };
  }
}
