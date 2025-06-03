import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { FileTypeType, FileTypeGenerationCondition, FileTypeGenerationTarget } from '../enums';

@InputType()
export class FileTypeEditInput {
  @Field(() => String, { nullable: true })
  templateId?: string;

  @Field(() => FileTypeType, { nullable: true })
  type?: FileTypeType;

  @Field(() => String, { nullable: true })
  layers?: string; // JSON string to be parsed

  @Field(() => FileTypeGenerationCondition, { nullable: true })
  generationCondition?: FileTypeGenerationCondition;

  @Field(() => FileTypeGenerationTarget, { nullable: true })
  generationTarget?: FileTypeGenerationTarget;

  @Field(() => String, { nullable: true })
  slug?: string;

  toQuery(): Prisma.FileTypeUpdateInput {
    return {
      templateId: this.templateId,
      type: this.type,
      layers: this.layers ? JSON.parse(this.layers) : undefined,
      generationCondition: this.generationCondition,
      generationTarget: this.generationTarget,
      slug: this.slug,
    };
  }
}
