import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class ProjectCountWhereInput {
  @Field(() => Boolean, { nullable: true })
  complete?: boolean | null

  toQuery(): Prisma.ProjectWhereInput {
    return {
      ...(typeof this.complete === 'boolean' ? { complete: this.complete } : {}),
    };
  }
}
