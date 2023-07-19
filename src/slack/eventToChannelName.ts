import { remove as removeDiacritics } from 'diacritics';
import { Event } from "@prisma/client";

export function eventToChannelName(event: Pick<Event, 'name'>): string {
  return removeDiacritics(event.name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}