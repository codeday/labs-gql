import { Event } from '@prisma/client';
import { DateTime } from 'luxon';

export function eventAllowsApplicationMentor(event: Event): boolean {
  const now = DateTime.now();
  return (
    DateTime.fromJSDate(event.mentorApplicationsStartAt) < now
    && DateTime.fromJSDate(event.mentorApplicationsEndAt) > now
  );
}

export function eventAllowsApplicationStudent(event: Event): boolean {
  const now = DateTime.now();
  return (
    DateTime.fromJSDate(event.studentApplicationsStartAt) < now
    && DateTime.fromJSDate(event.studentApplicationsEndAt) > now
  );
}
