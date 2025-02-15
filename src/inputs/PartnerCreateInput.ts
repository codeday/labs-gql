import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { Track } from '../enums';
import { GraphQLJSONObject } from 'graphql-type-json';

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

  @Field(() => Boolean, { nullable: true })
  onlyAffine?: boolean

  @Field(() => [String], { nullable: true })
  forceTags?: string[]

  @Field(() => [String], { nullable: true })
  forbidTags?: string[]

  @Field(() => GraphQLJSONObject, { nullable: true })
  contractSchema?: object

  @Field(() => GraphQLJSONObject, { nullable: true })
  contractUi?: object

  toQuery(): Omit<Prisma.PartnerCreateInput, 'event'> {
    return {
      partnerCode: this.partnerCode,
      weeks: this.weeks,
      minHours: this.minHours,
      skipPreferences: this.skipPreferences,
      onlyAffine: this.onlyAffine,
      forceTags: this.forceTags
        ? { connect: this.forceTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
      forbidTags: this.forbidTags
        ? { connect: this.forbidTags.map((id): Prisma.TagWhereUniqueInput => ({ id })) }
        : undefined,
      contractSchema: this.contractSchema ?? undefined,
      contractUi: this.contractUi ?? undefined,
    };
  }
}
