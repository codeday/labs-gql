import {
  ArtifactType as PrismaArtifactType,
  PersonType
} from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';

@ObjectType()
export class ArtifactType implements PrismaArtifactType {
  // Metadata
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  // Data
  @Field(() => String)
  name: string

  @Field(() => String, { nullable: true })
  description: string | null

  @Field(() => PersonType, { nullable: true })
  personType: PersonType | null;

  @Field(() => Boolean)
  required: boolean;

  @Field(() => String)
  eventId: string
}
