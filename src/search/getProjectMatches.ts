/* eslint-disable no-underscore-dangle */
import esb, {
  BoolQuery,
  FunctionScoreQuery, RangeQuery, ScoreFunction, TermQuery,
} from 'elastic-builder';
import { Client } from '@elastic/elasticsearch';
import { Partner, PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../config';
import {
  Student, Match, Project, Tag,
} from '../types';
import { Track, TagType } from '../enums';
import { geoToTimezone, getTimezoneOffset } from '../utils';
import { ELASTIC_NULL, ElasticEntryProperties as Entry } from './ElasticEntry';

const SCORE_WEIGHTS = {
  BASE: 1.0,
  COMPANY_MATCH: 1.0,
  URBAN_DENSITY_MATCH: 1.0,
  TIMEZONE_MATCH: 15.0,
  AFFINITY_MATCH: 10.0,
  TRACK_MATCH: 5.0,
  TAG_TECHNOLOGY_MATCH: 3.0,
  TAG_INTEREST_MATCH: 3.0,
  PREF_UNDERREPRESENTED_MATCH: 5.0,
  POPULARITY_DECAY_SCALE: 3.0,
  POPULARITY_DECAY_OFFSET: 3.0,
  POPULARITY_DECAY: 0.3,
};

function buildTagsScore(tags: Tag[]): ScoreFunction[] {
  const tagCount = tags.reduce((accum, { type }) => ({
    ...accum,
    [type]: accum[type as keyof typeof accum] + 1 || 1,
  }), {});

  return tags.map(({ id, type }) => esb.weightScoreFunction()
    .filter(
      esb.matchQuery(type === TagType.INTEREST ? Entry.interestTags : Entry.stackTags, id),
    )
    .weight(
      (type === TagType.INTEREST ? SCORE_WEIGHTS.TAG_INTEREST_MATCH : SCORE_WEIGHTS.TAG_TECHNOLOGY_MATCH)
      / tagCount[type as keyof typeof tagCount],
    ));
}

function isStudentUnderrepresented(student: Student): boolean {
  const profile = <Record<string, unknown> | undefined>student?.profile;
  if (!['he/him', 'he/him/his'].includes(<string | undefined>(profile?.pronouns) || 'he/him')) return true;
  if (!['white'].includes((<string>profile?.ethnicity || 'white').toLowerCase())) return true;
  return false;
}

async function getTimezone(student: Student): Promise<number> {
  if (student.timezone) {
    return getTimezoneOffset(student.timezone) || -7;
  }

  const profile = <{ location?: { postal?: string, country?: string } } | undefined>student?.profile;
  if (profile?.location?.postal && profile?.location?.country) {
    return await geoToTimezone(
      profile.location.postal,
      profile.location.country
    );
  }

  return -7;
}

function buildAffinityQuery(partner?: Partner | null): esb.MatchQuery | esb.BoolQuery {
  if (!partner) return esb.matchQuery(Entry.affinePartnerId, ELASTIC_NULL);
  if (partner.onlyAffine) return esb.matchQuery(Entry.affinePartnerId, partner.id);
  return esb.boolQuery().should([
    esb.matchQuery(Entry.affinePartnerId, ELASTIC_NULL),
    esb.matchQuery(Entry.affinePartnerId, partner.id),
  ]).minimumShouldMatch(1);
}

async function buildQueryFor(student: Student, tags: Tag[]): Promise<FunctionScoreQuery> {
  const prisma = Container.get(PrismaClient);
  const partner = student.partnerCode
    ? await prisma.partner.findFirstOrThrow({
      where: {
        partnerCode: student.partnerCode,
        eventId: student.eventId,
      },
      include: {
        forceTags: { select: { id: true } },
        forbidTags: { select: { id: true } },
      },
    })
    : null;
  const timezone = await getTimezone(student);

  const queryEventId = esb.matchQuery(Entry.eventId, student.eventId);

  const filteredTags = partner?.forbidTags && partner.forbidTags.length > 0
    ? tags.filter((t) => !partner.forbidTags.includes(t))
    : tags;
  const scoreTagsMatching = buildTagsScore(filteredTags);

  const partnerForceTags = partner?.forceTags && partner.forbidTags.length > 0
    ? esb.boolQuery().must(partner.forceTags.map(({ id }) => esb.termQuery('tags', id)))
    : undefined;

  const partnerForbidTags = partner?.forbidTags && partner.forbidTags.length > 0
    ? esb.boolQuery().mustNot(partner.forbidTags.map(({ id }) => esb.termQuery('tags', id)))
    : undefined;

  const queryStudentRequiresLength = esb.rangeQuery(Entry.maxWeeks).gte(student.weeks);

  const queryStudentIsUnderrepresented = isStudentUnderrepresented(student)
    ? undefined
    : esb.rangeQuery(Entry.prefUnderrepresented).lt(3);
  const scoreStudentUnderrepresented = isStudentUnderrepresented(student)
    ? esb.weightScoreFunction()
      .filter(esb.matchQuery(Entry.prefUnderrepresented, '2'))
      .weight(SCORE_WEIGHTS.PREF_UNDERREPRESENTED_MATCH)
    : esb.weightScoreFunction()
      .filter(esb.matchQuery(Entry.prefUnderrepresented, '2'))
      .weight(1 / SCORE_WEIGHTS.PREF_UNDERREPRESENTED_MATCH);

  const queryTrack = student.track === Track.BEGINNER
    ? esb.matchQuery(Entry.track, Track.BEGINNER)
    : esb.boolQuery().should([
      esb.matchQuery(Entry.track, Track.INTERMEDIATE),
      esb.matchQuery(Entry.track, Track.ADVANCED),
    ]).minimumShouldMatch(1);
  const scoreTrack = esb.weightScoreFunction()
    .filter(esb.matchQuery(Entry.track, student.track))
    .weight(SCORE_WEIGHTS.TRACK_MATCH);

  // Range query is broken for weight score_function
  const scoreTimezone = esb.weightScoreFunction()
    .filter(
      esb.boolQuery()
        .should([
          esb.matchQuery(Entry.timezoneOffset, (timezone - 4).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone - 3).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone - 2).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone - 1).toString()),
          esb.matchQuery(Entry.timezoneOffset, timezone.toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone + 1).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone + 2).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone + 3).toString()),
          esb.matchQuery(Entry.timezoneOffset, (timezone + 4).toString()),
        ]),
    )
    .weight(SCORE_WEIGHTS.TIMEZONE_MATCH);

  const queryAffinity = buildAffinityQuery(partner);
  const scoreAffinity = partner
    ? esb.weightScoreFunction()
      .filter(esb.matchQuery(Entry.affinePartnerId, partner.id))
      .weight(SCORE_WEIGHTS.AFFINITY_MATCH)
    : undefined;

  const scorePopularity = esb.decayScoreFunction('gauss', Entry.studentsSelected)
    .origin(0)
    .scale(SCORE_WEIGHTS.POPULARITY_DECAY_SCALE)
    .offset(SCORE_WEIGHTS.POPULARITY_DECAY_OFFSET)
    .decay(SCORE_WEIGHTS.POPULARITY_DECAY);

  return esb.functionScoreQuery()
    .query(esb.boolQuery().must(<(RangeQuery | TermQuery | BoolQuery)[]>[
      partnerForceTags,
      partnerForbidTags,
      queryStudentRequiresLength,
      queryTrack,
      queryAffinity,
      queryStudentIsUnderrepresented,
      queryEventId,
    ].filter(Boolean)))
    .functions(<ScoreFunction[]>[
      ...scoreTagsMatching,
      scoreTrack,
      scoreStudentUnderrepresented,
      scorePopularity,
      scoreTimezone,
      scoreAffinity,
    ].filter(Boolean))
    .scoreMode('multiply')
    .boostMode('replace');
}

export async function getProjectMatches(student: Student, tags: Tag[]): Promise<Match[]> {
  const prisma = Container.get(PrismaClient);
  const elastic = Container.get(Client);

  const query = esb.requestBodySearch().query(await buildQueryFor(student, tags)).toJSON();

  const { body } = await elastic.search({
    index: config.elastic.index,
    type: '_doc',
    body: query,
    explain: config.debug,
    size: 150,
  });

  if (!body?.hits?.hits) return [];
  const hits = <{ _id: string, _score: number, _explanation: Record<string, unknown> | undefined }[]>body.hits.hits;

  const projects = await prisma.project.findMany({
    where: { id: { in: hits.map((r) => r._id) } },
    include: { tags: true, mentors: true },
  });

  return projects
    .map((e) => ({
      score: hits.filter(({ _id }) => e.id === _id)[0]?._score || 0,
      project: <Project>e,
    }))
    .sort((a, b) => (a.score > b.score ? -1 : 1));
}
