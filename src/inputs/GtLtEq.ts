import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class GtLtEq {
  @Field(() => Number, { nullable: true })
  gt?: number

  @Field(() => Number, { nullable: true })
  gte?: number

  @Field(() => Number, { nullable: true })
  lt?: number

  @Field(() => Number, { nullable: true })
  lte?: number

  @Field(() => Number, { nullable: true })
  eq?: number

  toQuery(): Prisma.IntFilter {
    if (!this.gt && !this.gte && !this.lt && !this.lte && !this.eq) throw new Error('Specify GT, GTE, LT, LTE, or EQ');
    if (this.gt && this.gte) throw new Error('Do not specify both gt and gte.');
    if (this.lt && this.lte) throw new Error('Do not specify both lt and lte.');
    if (this.eq && (this.lt || this.lte || this.gt || this.gte)) throw new Error('Do not specify eq with others.');
    return {
      ...(this.gt ? { gt: this.gt } : {}),
      ...(this.gte ? { gte: this.gte } : {}),
      ...(this.lt ? { lt: this.lt } : {}),
      ...(this.lte ? { lte: this.lte } : {}),
      ...(this.eq ? { equals: this.eq } : {}),
    };
  }
}
