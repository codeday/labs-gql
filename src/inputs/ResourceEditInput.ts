import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class ResourceEditInput {
  @Field(() => String, { nullable: true })
  name?: string

  @Field(() => String, { nullable: true })
  link?: string

  @Field(() => Boolean, { nullable: true })
  displayToMentors?: boolean

  @Field(() => Boolean, { nullable: true })
  displayToStudents?: boolean

  toQuery(): Omit<Prisma.ResourceUpdateInput, 'event' | 'eventId'> {
    return {
      ...(typeof this.name === 'string' ? { name: this.name } : {}),
      ...(typeof this.link === 'string' ? { link: this.link } : {}),
      ...(typeof this.displayToMentors === 'boolean' ? { displayToMentors: this.displayToMentors } : {}),
      ...(typeof this.displayToStudents === 'boolean' ? { displayToStudents: this.displayToStudents } : {}),
    };
  }
}
