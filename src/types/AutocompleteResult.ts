import { Field, ObjectType, registerEnumType } from "type-graphql";

export enum AutocompleteType {
  STUDENT = 'STUDENT',
  MENTOR = 'MENTOR',
  PROJECT = 'PROJECT',
};

registerEnumType(AutocompleteType, { name: 'AutocompleteType' });

@ObjectType()
export class AutocompleteResult {
  @Field(() => AutocompleteType)
  type: AutocompleteType;

  @Field(() => String)
  name: String;

  @Field(() => String)
  id: String;
  
  @Field(() => String)
  eventId: String;
}