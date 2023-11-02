import { remove as removeDiacritics } from 'diacritics';

export function nameToSlug(s: string): string {
  return removeDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}