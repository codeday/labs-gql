import { remove as removeDiacritics } from 'diacritics';
import { Event, Mentor } from "@prisma/client";

export function eventToChannelName(event: Pick<Event, 'name'>): string {
  return removeDiacritics(event.name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

export function projectToSlackChannelName(
  project: { mentors: Pick<Mentor, 'givenName' | 'surname'>[] }
): string {
  return project.mentors
    .flatMap(m => [m.givenName, m.surname])
    .filter(Boolean)
    .map(removeDiacritics)
    .map(s => s.toLowerCase())
    .join(' ')
    .replace(/[^a-z0-9-]/g, '-');
}