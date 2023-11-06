import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class RepositoryCreateInput {
  @Field(() => String, { nullable: true })
  logoUrl?: string | null

  @Field(() => String)
  name: string

  @Field(() => String)
  url: string

  toQuery(): Prisma.RepositoryCreateInput {
    return {
      logoUrl: this.logoUrl,
      name: this.name,
      url: this.url,
    };
  }
}
