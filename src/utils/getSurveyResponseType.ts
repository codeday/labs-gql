import { SurveyResponse } from '@prisma/client';

export enum SurveyResponseType {
  SELF = 'self',
  PEER = 'peer',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  PROJECT = 'project',
}

export function getSurveyResponseType(response: SurveyResponse): SurveyResponseType {
  if (response.projectId) return SurveyResponseType.PROJECT;
  if (response.mentorId === response.authorMentorId || response.studentId === response.authorStudentId) {
    return SurveyResponseType.SELF;
  }
  if (response.authorMentorId && response.studentId) return SurveyResponseType.MENTEE;
  if (response.authorStudentId && response.mentorId) return SurveyResponseType.MENTOR;
  return SurveyResponseType.PEER;
}
