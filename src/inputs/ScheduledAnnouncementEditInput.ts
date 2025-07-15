import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class ScheduledAnnouncementEditInput {
  @Field(() => Date, { nullable: true })
  sendAt?: Date | null;

  @Field(() => String, { nullable: true })
  subject?: string | null;

  @Field(() => String, { nullable: true })
  body?: string | null;

  @Field(() => String, { nullable: true })
  medium?: string | null;

  @Field(() => String, { nullable: true })
  target?: string | null;

  @Field(() => Boolean, { nullable: true })
  isSent?: boolean | null;

  public toQuery(): Prisma.ScheduledAnnouncementUpdateInput {
    return {
      sendAt: this.sendAt ?? undefined,
      subject: this.subject ?? undefined,
      body: this.body ?? undefined,
      medium: this.medium as any ?? undefined,
      target: this.target as any ?? undefined,
    };
  }
}
