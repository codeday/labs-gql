import esb, {
  FunctionScoreQuery, RangeQuery, ScoreFunction, TermQuery,
} from 'elastic-builder';
import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../config';
import {
  Student, Match, Project, Tag,
} from '../types';
import { Track, TagType } from '../enums';
import { ElasticEntryProperties as Entry } from './ElasticEntry';

const SCORE_WEIGHTS = {
  BASE: 1.0,
  COMPANY_MATCH: 1.0,
  URBAN_DENSITY_MATCH: 2.0,
  TRACK_MATCH: 6.0,
  TAG_TECHNOLOGY_MATCH: 1.5,
  TAG_INTEREST_MATCH: 1.5,
  PREF_UNDERREPRESENTED_MATCH: 2.0,
  POPULARITY_DECAY_OFFSET: 3.0,
  POPULARITY_DECAY: 0.5,
};

function buildTagsScore(tags: Tag[]): ScoreFunction[] {
  const tagCount = tags.reduce((accum, { type }) => ({
    ...accum,
    [type]: accum[type as keyof typeof accum] + 1 || 1,
  }), {});

  return tags.map(({ id, type }) => esb.weightScoreFunction()
    .filter(esb.termQuery(type === TagType.INTEREST ? Entry.interestTags : Entry.stackTags, id))
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

function buildQueryFor(student: Student, tags: Tag[]): FunctionScoreQuery {
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
    .filter(esb.termQuery(Entry.track, student.track))
    .weight(SCORE_WEIGHTS.TRACK_MATCH);

  const scorePopularity = esb.decayScoreFunction('gauss', Entry.studentsSelected)
    .origin(0)
    .scale(3)
    .offset(SCORE_WEIGHTS.POPULARITY_DECAY_OFFSET)
    .decay(SCORE_WEIGHTS.POPULARITY_DECAY);

  return esb.functionScoreQuery()
    .query(esb.boolQuery().must(<(RangeQuery | TermQuery)[]>[
      queryStudentRequiresLength,
      queryTrack,
      queryStudentIsUnderrepresented,
    ].filter(Boolean))).functions([
      ...scoreTagsMatching,
      scoreTrack,
      scoreStudentUnderrepresented,
      scorePopularity,
    ].filter(Boolean))
    .scoreMode('sum');
}

export async function getProjectMatches(student: Student, tags: Tag[]): Promise<Match[]> {
  const prisma = Container.get(PrismaClient);
  const elastic = Container.get(Client);

  const query = esb.requestBodySearch().query(buildQueryFor(student, tags)).toJSON();

  const { body } = await elastic.search({
    index: config.elastic.index,
    type: '_doc',
    body: query,
    size: 25,
  });

  if (!body?.hits?.hits) return [];
  const hits = <{ _id: string, _score: number }[]>body.hits.hits;
  const projects = await prisma.project.findMany({
    where: {
      id: {
        // eslint-disable-next-line no-underscore-dangle
        in: hits.map((r) => r._id),
      },
    },
  });

  return projects
    .map((e) => ({
      score: hits.filter(({ _id }) => e.id === _id)[0]?._score || 0,
      project: <Project>e,
    }))
    .sort((a, b) => (a.score > b.score ? -1 : 1));
}
