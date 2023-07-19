import { remove as removeDiacritics } from 'diacritics';
import { Mentor } from "@prisma/client";

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
