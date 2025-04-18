import { Prisma } from "@prisma/client";
import { Field, InputType, registerEnumType } from "type-graphql";
import { AuthContext } from "../context";

export enum EventStateFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UPCOMING = 'UPCOMING',
  PAST = 'PAST',
  ACCEPTING_STUDENT_APPLICATIONS = 'ACCEPTING_STUDENT_APPLICATIONS',
  ACCEPTING_MENTOR_APPLICATIONS = 'ACCEPTING_MENTOR_APPLICATIONS',
};
registerEnumType(EventStateFilter, { name: 'EventStateFilter' });

@InputType()
export class EventsWhereInput {
  @Field(() => EventStateFilter, { nullable: true })
  state?: EventStateFilter

  @Field(() => Boolean, { nullable: true })
  public?: boolean

  @Field(() => Boolean, { nullable: true })
  mine?: boolean

  @Field(() => String, { nullable: true })
  partnerCode?: string

  private dateFilterToWhere(): Prisma.EventWhereInput {
    if (!this.state) return {};

    const now = new Date();
    switch (this.state) {
      case EventStateFilter.ACTIVE:
        return { OR: [{ isActive: true }, { startsAt: { gt: now } }] };
      case EventStateFilter.INACTIVE:
        return { isActive: false };
      case EventStateFilter.UPCOMING:
        return {
          startsAt: { gt: now },
        };
      case EventStateFilter.PAST:
        return {
          startsAt: { lt: now },
          isActive: false,
        };
      case EventStateFilter.ACCEPTING_STUDENT_APPLICATIONS:
        return {
          studentApplicationsStartAt: { lt: now },
          studentApplicationsEndAt: { gt: now },
        };
      case EventStateFilter.ACCEPTING_MENTOR_APPLICATIONS:
        return {
          mentorApplicationsStartAt: { lt: now },
          mentorApplicationsEndAt: { gt: now },
        };
    }
  }

  toQuery(auth: AuthContext): Prisma.EventWhereInput {
    return {
      AND: [
        this.public ? { partnersOnly: false } : {},
        this.dateFilterToWhere(),
        this.partnerCode ? { partners: { some: { partnerCode: { equals: this.partnerCode, mode: 'insensitive' } } } } : {},
        this.mine ? {
          OR: [
            { mentors: { some: { username: auth.username || '' } } },
            { mentors: { some: { managerUsername: auth.username || '' } } },
            { students: { some: { username: auth.username || '' } } },
          ],
        } : {},
      ],
    };
  }
}