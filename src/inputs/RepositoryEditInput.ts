import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class RepositoryEditInput {
  @Field(() => String, { nullable: true })
  logoUrl?: string | null

  @Field(() => String, { nullable: true })
  name?: string | null

  @Field(() => String, { nullable: true })
  url?: string | null

  @Field(() => String, { nullable: true })
  useDescription?: string | null

  @Field(() => String, { nullable: true })
  impactDescription?: string | null

  toQuery(): Prisma.RepositoryUpdateInput {
    return {
      ...(typeof this.logoUrl === 'string' ? { logoUrl: this.logoUrl } : {}),
      ...(typeof this.name === 'string' ? { name: this.name } : {}),
      ...(typeof this.url === 'string' ? { url: this.url } : {}),
      ...(typeof this.useDescription === 'string' ? { useDescription: this.useDescription } : {}),
      ...(typeof this.impactDescription === 'string' ? { impactDescription: this.impactDescription } : {}),
    };
  }
}
