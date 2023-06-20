import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { Track } from '../enums';

@InputType()
export class PartnerEditInput {
  @Field(() => String, { nullable: true })
  partnerCode: string

  @Field(() => Int, { nullable: true })
  weeks?: number

  @Field(() => Int, { nullable: true })
  minHours?: number

  @Field(() => Boolean, { nullable: true })
  skipPreferences?: boolean

  @Field(() => Boolean, { nullable: true })
  onlyAffine?: boolean

  @Field(() => [String], { nullable: true })
  forceTags?: string[]

  @Field(() => [String], { nullable: true })
  forbidTags?: string[]

  toQuery(): Prisma.PartnerUpdateInput {
    return {
      partnerCode: this.partnerCode.toUpperCase(),
      weeks: this.weeks,
      minHours: this.minHours,
      skipPreferences: typeof this.skipPreferences === 'boolean'
        ? this.skipPreferences
        : undefined,
      onlyAffine: typeof this.onlyAffine === 'boolean'
        ? this.onlyAffine
        : undefined,
      forceTags: this.forceTags
        ? { set: this.forceTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
      forbidTags: this.forbidTags
        ? { set: this.forbidTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
    };
  }
}
