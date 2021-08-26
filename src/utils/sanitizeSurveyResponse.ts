import { Prisma, Survey, SurveyResponse } from '@prisma/client';
import { PersonType } from '../enums';
import { AuthContext } from '../context';
import { getSurveyResponseType } from './getSurveyResponseType';
import { deepIntersection } from './deep';

enum SurveyShareWith {
  MENTOR = 'mentor',
  STUDENT = 'student',
  ALL = 'all',
}

interface SurveyShareConfig {
  [key: string]: SurveyShareWith | SurveyShareConfig
}

export function sanitizeSurveyResponse(
  surveyResponse: SurveyResponse,
  survey: Survey,
  auth: AuthContext,
): SurveyResponse {
  const surveyShareName = `${getSurveyResponseType(surveyResponse)}Share`;
  const shareConfig = surveyShareName in survey ? survey[surveyShareName as keyof Survey] as SurveyShareConfig : null;

  const { response, ...rest } = surveyResponse;
  return {
    ...rest,
    response: filterResponse(response, shareConfig, auth.isStudent ? PersonType.STUDENT : PersonType.MENTOR),
  };
}

export function sanitizeSurveyResponses(
  responses: SurveyResponse[],
  survey: Survey,
  auth: AuthContext,
): SurveyResponse[] {
  return responses
    .map((r) => sanitizeSurveyResponse(r, survey, auth))
    .filter((r) => r.response && typeof r.response === 'object' && Object.keys(r.response).length > 0);
}
