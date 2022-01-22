/* eslint-disable no-underscore-dangle */
import esb, {
  FunctionScoreQuery, RangeQuery, ScoreFunction, TermQuery,
} from 'elastic-builder';
import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../config';
import {
  Student, Recommendation, Project, Tag,
} from '../types';
import { Track, TagType } from '../enums';
import { geoToTimezone } from '../utils';
import { ElasticEntryProperties as Entry } from './ElasticEntry';

const SCORE_WEIGHTS = {
  BASE: 1.0,
  COMPANY_MATCH: 1.0,
  URBAN_DENSITY_MATCH: 1.0,
  TIMEZONE_MATCH: 15.0,
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

async function buildQueryFor(student: Student, tags: Tag[]): Promise<FunctionScoreQuery> {
  const profile = <{ location?: { postal?: string, country?: string } } | undefined>student?.profile;
  const timezone = profile?.location?.postal && profile?.location?.country
    ? await geoToTimezone(profile.location.postal, profile.location.country)
    : -7;

  const scoreTagsMatching = buildTagsScore(tags);

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

  const scorePopularity = esb.decayScoreFunction('gauss', Entry.studentsSelected)
    .origin(0)
    .scale(SCORE_WEIGHTS.POPULARITY_DECAY_SCALE)
    .offset(SCORE_WEIGHTS.POPULARITY_DECAY_OFFSET)
    .decay(SCORE_WEIGHTS.POPULARITY_DECAY);

  return esb.functionScoreQuery()
    .query(esb.boolQuery().must(<(RangeQuery | TermQuery)[]>[
      queryStudentRequiresLength,
      queryTrack,
      queryStudentIsUnderrepresented,
    ].filter(Boolean)))
    .functions([
      ...scoreTagsMatching,
      scoreTrack,
      scoreStudentUnderrepresented,
      scorePopularity,
      scoreTimezone,
    ])
    .scoreMode('multiply')
    .boostMode('replace');
}

export async function getProjectRecs(student: Student, tags: Tag[]): Promise<Recommendation[]> {
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
