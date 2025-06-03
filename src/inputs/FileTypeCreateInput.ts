import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { FileTypeType, FileTypeGenerationCondition, FileTypeGenerationTarget } from '../enums';

@InputType()
export class FileTypeCreateInput {
  @Field(() => String)
  templateId: string;

  @Field(() => FileTypeType)
  type: FileTypeType;

  @Field(() => String)
  layers: string; // JSON string to be parsed

  @Field(() => FileTypeGenerationCondition)
  generationCondition: FileTypeGenerationCondition;

  @Field(() => FileTypeGenerationTarget)
  generationTarget: FileTypeGenerationTarget;

  @Field(() => String)
  slug: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  toQuery(eventId: string): Prisma.FileTypeCreateInput {
    return {
      templateId: this.templateId,
      type: this.type,
      layers: JSON.parse(this.layers),
      generationCondition: this.generationCondition,
      generationTarget: this.generationTarget,
      slug: this.slug,
      event: { connect: { id: this.eventId || eventId } },
    };
  }
}
