import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class RepositoryWhereInput {
  @Field(() => Boolean, { nullable: true })
  hasLogo?: boolean | null

  @Field(() => Boolean, { nullable: true })
  hasProjects?: boolean | null

  toQuery(): Prisma.RepositoryWhereInput {
    return {
      ...(typeof this.hasLogo !== 'boolean' ? {} : (
        this.hasLogo ? { logoUrl: { not: null } } : { logoUrl: null }
      )),
      ...(typeof this.hasProjects !== 'boolean' ? {} : (
        this.hasProjects ? { projects: { some: {} } } : { projects: { none: {} } }
      )),
    };
  }
}
