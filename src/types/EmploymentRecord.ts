import { Event, Student } from '@prisma/client';
import { ObjectType, Field } from 'type-graphql';
import { DateTime } from 'luxon';

@ObjectType()
export class EmploymentRecord {
  student: Student & { event: Event, projects: ({ mentors: ({ givenName: string, surname: string })[] })[] }

  @Field(() => Date, { name: 'start' })
  public getStart() {
    return this.student.event.startsAt;
  }

  @Field(() => Date, { name: 'end' })
  public getEnd() {
    return DateTime.fromJSDate(this.student.event.startsAt)
      .plus({ weeks: this.student.weeks })
      .minus({ days: 3 }) // should end on Friday of the last week of the program
      .toJSDate(); 
  }

  @Field(() => String, { name: 'title' })
  public getTitle() {
    return this.student.event.title;
  }

  @Field(() => [String], { name: 'mentors' })
  public getMentors() {
    return this.student.projects
      .flatMap((p) => p.mentors)
      .flatMap((m) => `${m.givenName} ${m.surname}`);
  }

  @Field(() => Boolean, { name: 'eligibleForRehire' })
  public getEligibleForRehire() {
    return true; // TODO(@tylermenezes): check reflections to determine this
  }
}
