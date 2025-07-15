import { InputType, Field } from 'type-graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class ScheduledAnnouncementCreateInput {
  @Field(() => Date)
  sendAt: Date;

  @Field(() => String, { nullable: true })
  subject?: string;

  @Field(() => String)
  body: string;

  @Field(() => String)
  medium: string;

  @Field(() => String)
  target: string;

  @Field(() => String)
  eventId: string;

  public toQuery(): Prisma.ScheduledAnnouncementCreateInput {
    return {
      sendAt: this.sendAt,
      subject: this.subject ?? undefined,
      body: this.body,
      medium: this.medium as any,
      target: this.target as any,
      isSent: false,
      event: {
        connect: { id: this.eventId }
      }
    };
  }
}
