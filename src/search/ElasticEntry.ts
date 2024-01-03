import {
  Project, Mentor, Tag, ProjectPreference,
} from '@prisma/client';
import { getTimezoneOffset as getTimezoneOffsetInner } from '../utils';
import { Track, TagType, MentorStatus } from '../enums';

export const ELASTIC_NULL = '__ELASTIC_NULL';

export type FieldType = 'none' | 'geo_point' | 'geo_shape' | 'ip' | 'binary' | 'keyword' | 'text'
  | 'search_as_you_type' | 'date' | 'date_nanos' | 'boolean' | 'completion' | 'nested' | 'object'
  | 'murmur3' | 'token_count' | 'percolator' | 'integer' | 'long' | 'short' | 'byte' | 'float' | 'half_float'
  | 'scaled_float' | 'double' | 'integer_range' | 'float_range' | 'long_range' | 'double_range' | 'date_range'
  | 'ip_range' | 'alias' | 'join' | 'rank_feature' | 'rank_features' | 'flattened' | 'shape' | 'histogram'
  | 'constant_keyword'

export const ElasticEntrySchema: Record<string, FieldType> = {
  id: 'keyword',
  eventId: 'keyword',
  studentsSelected: 'integer',

  interestTags: 'keyword',
  stackTags: 'keyword',
  tags: 'keyword',

  affinePartnerId: 'text',

  available: 'boolean',
  maxWeeks: 'integer',
  track: 'keyword',
  timezoneOffset: 'float',

  mentorSchools: 'text',
  mentorDegrees: 'text',
  mentorCompanies: 'text',
  mentorRoles: 'text',
  mentorIndustries: 'text',
  mentorUnderrepresented: 'boolean',
  mentorUnderrepresentedGender: 'boolean',
  mentorUnderrepresentedEthnicity: 'boolean',

  prefUnderrepresented: 'integer',
  prefCompanyMatch: 'integer',
  prefSchoolMatch: 'integer',
  prefSimilarUpbringing: 'integer',
};

export enum ElasticEntryProperties {
  id = 'id',
  eventId = 'eventId',
  studentsSelected = 'studentsSelected',
  interestTags = 'interestTags',
  stackTags = 'stackTags',
  tags = 'tags',
  affinePartnerId = 'affinePartnerId',
  available = 'available',
  maxWeeks = 'maxWeeks',
  track = 'track',
  timezoneOffset = 'timezoneOffset',
  mentorSchools = 'mentorSchools',
  mentorDegrees = 'mentorDegrees',
  mentorCompanies = 'mentorCompanies',
  mentorRoles = 'mentorRoles',
  mentorIndustries = 'mentorIndustries',
  mentorUnderrepresented = 'mentorUnderrepresented',
  mentorUnderrepresentedGender = 'mentorUnderrepresentedGender',
  mentorUnderrepresentedEthnicity = 'mentorUnderrepresentedEthnicity',
  prefUnderrepresented = 'prefUnderrepresented',
  prefCompanyMatch = 'prefCompanyMatch',
  prefSchoolMatch = 'prefSchoolMatch',
  prefSimilarUpbringing = 'prefSimilarUpbringing',
}

export interface ElasticEntry {
  id: string
  eventId: string
  studentsSelected: number

  interestTags: string[]
  stackTags: string[]
  tags: string[]

  affinePartnerId: string

  available: boolean
  maxWeeks: number
  track: Track
  timezoneOffset: number

  mentorSchools: string[]
  mentorDegrees: string[]
  mentorCompanies: string[]
  mentorRoles: string[]
  mentorIndustries: string[]
  mentorUnderrepresented: boolean
  mentorUnderrepresentedGender: boolean
  mentorUnderrepresentedEthnicity: boolean

  prefUnderrepresented: number
  prefCompanyMatch: number
  prefSchoolMatch: number
  prefSimilarBackground: number
  prefSimilarUpbringing: number
}

type ProjectInput = Project & { mentors: Mentor[], tags: Tag[], projectPreferences: ProjectPreference[] }

function getTimezoneOffset(timezoneString?: string) {
  if (!timezoneString) return -7;
  const basicLookup = getTimezoneOffsetInner(timezoneString);
  if (basicLookup) return basicLookup;
  return {
    'America - Pacific': -7,
    'America - Mountain': -6,
    'America - Central': -5,
    'America - Eastern': -4,
    'Taiwan - CST': 8,
    'GMT+8': 8,
    'Asia pacific': 9,
    SGT: 8,
    Singapore: 8,
    'APAC - Singapore': 8,
  }[timezoneString || ''] || -7;
}

export function projectToElasticEntry({
  mentors, tags, projectPreferences, ...project
}: ProjectInput): ElasticEntry | null {
  if (mentors.length === 0 || !project.eventId) return null;
  const profiles = mentors.map(({ profile }) => <Record<string, unknown>>profile).filter(Boolean);
  const educations = profiles.map(({ education }) => <Record<string, unknown>>education).filter(Boolean);
  const background = {
    mentorUnderrepresentedGender: profiles.reduce(
      (accum, { pronouns }) => accum || !['he/him', 'he/him/his'].includes((<string>pronouns || '').toLowerCase()),
      false,
    ),
    mentorUnderrepresentedEthnicity: profiles.reduce(
      (accum, { ethnicity }) => accum || !['white'].includes((<string>ethnicity || '').toLowerCase()),
      false,
    ),
  };
  const parsePrefs = (prefs: (string | undefined)[]) => Math.max(
    1,
    ...prefs.filter(Boolean).map((p) => Number.parseInt(p || '1', 10) || 1),
  );

  const hasAvailableMentor = mentors.reduce((accum, { status }) => accum || status === MentorStatus.ACCEPTED, false);
  return {
    id: project.id,
    eventId: project.eventId,
    studentsSelected: projectPreferences.length,

    interestTags: tags.filter(({ type }) => type === TagType.INTEREST).map(({ id }) => id),
    stackTags: tags.filter(({ type }) => type === TagType.TECHNOLOGY).map(({ id }) => id),
    tags: tags.map(({ id }) => id),

    affinePartnerId: project.affinePartnerId || ELASTIC_NULL,

    available: project.status === 'ACCEPTED' && hasAvailableMentor,
    maxWeeks: Math.max(...mentors.map(({ maxWeeks }) => maxWeeks)),
    track: project.track,
    timezoneOffset: getTimezoneOffset(mentors[0].timezone || <string | undefined>profiles[0]?.timezone),

    mentorSchools: educations.map(({ school }) => <string>school).filter(Boolean),
    mentorDegrees: educations.map(({ degree }) => <string>degree).filter(Boolean),
    mentorCompanies: profiles.map(({ company }) => <string>company).filter(Boolean),
    mentorRoles: profiles.map(({ role }) => <string>role).filter(Boolean),
    mentorIndustries: profiles.map(({ industry }) => <string>industry).filter(Boolean),
    ...background,
    mentorUnderrepresented: background.mentorUnderrepresentedEthnicity || background.mentorUnderrepresentedGender,

    prefUnderrepresented: parsePrefs(profiles.map(({ preferUnderrep }) => <string | undefined>preferUnderrep)),
    prefSchoolMatch: parsePrefs(profiles.map(({ preferSchoolMatch }) => <string | undefined>preferSchoolMatch)),
    prefCompanyMatch: parsePrefs(profiles.map(({ preferCompanyMatch }) => <string | undefined>preferCompanyMatch)),
    prefSimilarBackground: parsePrefs(
      profiles.map(({ preferSimilarBackground }) => <string | undefined>preferSimilarBackground),
    ),
    prefSimilarUpbringing: parsePrefs(
      profiles.map(({ preferSimilarUpbringing }) => <string | undefined>preferSimilarUpbringing),
    ),
  };
}
