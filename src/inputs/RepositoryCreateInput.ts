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

  @Field(() => String, { nullable: true })
  useDescription?: string | null

  @Field(() => String, { nullable: true })
  impactDescription?: string | null

  toQuery(): Prisma.RepositoryCreateInput {
    return {
      logoUrl: this.logoUrl,
      name: this.name,
      url: this.url,
      useDescription: this.useDescription,
      impactDescription: this.impactDescription,
    };
  }
}
