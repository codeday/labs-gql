import { Field, ID, ObjectType } from 'type-graphql';
import { FileType } from './FileType';

@ObjectType()
export class File {
  @Field(() => ID)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field({ nullable: true })
  url?: string;

  @Field(() => String)
  fileTypeId: string;

  @Field(() => FileType)
  fileType: FileType;
}
