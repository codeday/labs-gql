import { InputType, Field, Arg, Ctx } from 'type-graphql';
import { Context } from '../context';

@InputType()
export class IdOrUsernameOrEmailInput {
  @Field(() => String, { nullable: true })
  id?: string

  @Field(() => String, { nullable: true })
  username?: string

  @Field(() => String, { nullable: true })
  email?: string

  toQuery(): { id: string } | { username: string } | { email: string } {
    if (this.id) return { id: this.id };
    if (this.username) return { username: this.username };
    if (this.email) return { email: this.email };
    throw new Error('Either ID, Username, or Email must be provided.');
  }
}
