import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class ResourceCreateInput {
  @Field(() => String)
  name: string

  @Field(() => String)
  link: string

  @Field(() => Boolean)
  displayToMentors: boolean

  @Field(() => Boolean)
  displayToStudents: boolean

  @Field(() => Boolean)
  displayToPartners: boolean

  @Field(() => Boolean)
  displayToManagers: boolean

  toQuery(): Omit<Prisma.ResourceCreateInput, 'event' | 'eventId'> {
    return {
      name: this.name,
      link: this.link,
      displayToMentors: this.displayToMentors,
      displayToStudents: this.displayToStudents,
      displayToPartners: this.displayToPartners,
      displayToManagers: this.displayToManagers,
    };
  }
}
