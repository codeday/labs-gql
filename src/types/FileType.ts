import { Field, ID, ObjectType } from 'type-graphql';
import { FileTypeType, FileTypeGenerationCondition, FileTypeGenerationTarget } from '../enums';
import { GraphQLJSONObject } from 'graphql-type-json';

@ObjectType()
export class FileType {
  @Field(() => ID)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => String)
  templateId: string;

  @Field(() => FileTypeType)
  type: FileTypeType;

  @Field(() => GraphQLJSONObject)
  layers: object;

  @Field(() => FileTypeGenerationCondition)
  generationCondition: FileTypeGenerationCondition;

  @Field(() => FileTypeGenerationTarget)
  generationTarget: FileTypeGenerationTarget;

  @Field({ nullable: true })
  emailSubject?: string;

  @Field({ nullable: true })
  emailContent?: string;

  @Field()
  eventId: string;
}
