//@ts-nocheck
import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { anonymousId } from '../src/utils';
import { DateTime } from 'luxon';

function dropFields<T extends Record<string, any>>(toDrop: string[]): (model: T) => Partial<T> {
  return function(model: T): Partial<T> {
    const out = { ...model };
    for (const field of toDrop) {
      delete out[field];
    }
    return out;
  }
}

const LOW_INCOME_PARTNER_CODES = [];
const LOW_INCOME_SCHOOLS = [];

function anonymizeProfile<T extends object>(profileField: string): (model: T) => T {
  return function(model: T): T {
    const profileValue = model[profileField];
    const out = { ...model };
    delete out[profileField];

    out[profileField] = {
      haveDone: profileValue?.haveDone,
      ethnicities: profileValue?.ethnicities || profileValue.ethnicity,
      pronouns: profileValue?.pronouns,
      country: profileValue?.country || profileValue.location?.country,
      role: profileValue?.role,
      lowIncome: model?.partnerCode
    };
    return out;
  }
}

function anonymizeModel<T extends object>(type: string): (model: T) => T {
  return function(model: T): T {
    //
    const out = { ...model };
    for (const field of Object.keys(model)) {
      if (
        (type === 'tag' && field === 'id') || field === 'tag' || field === 'tagId'
        || (type === 'event' && field === 'id') || field === 'event' || field === 'eventId'
        || field === 'emailId'
      ) {
        // Don't anonymize
      } else if (['email', 'username', 'partnerCode', 'givenName', 'surname'].includes(field)) {
        out[field] = anonymousId(field, model[field]);
      } else if (field === 'id') {
        out[field] = anonymousId(type, model[field]);
      } else if (field.slice(-2) === 'Id') {
        const fieldType = field.slice(0, field.length - 2);
        out[field] = anonymousId(fieldType, model[field])
      }
    }

    return out;
  }
}

function anonymizeMappingModel<T extends {A: string, B: string}>(aType: string, bType: string): (mode: T) => T {
  return function(model: T): T {
    return {
      ...model,
      A: ['event', 'tag', 'eventId', 'tagId'].includes(aType) ? model.A : anonymousId(aType, model.A),
      B: ['event', 'tag', 'eventId', 'tagId'].includes(bType) ? model.B : anonymousId(bType, model.B),
    };
  }
}

function writeTable(fileName: string, table: object[]) {
  const path = `${__dirname}/../export/${fileName}`;
  const dirPath = dirname(path);
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

  const file = stringify(table, { header: true });
  writeFileSync(path, file);
  console.log(fileName);
}

async function dumpTables(prisma: PrismaClient, eventIdFilter: Prisma.StringFilter) {
  const filter = { eventId: eventIdFilter };
  return {
    admissionRating: (await prisma.admissionRating.findMany({ where: { student: filter } }))
      .map(anonymizeModel('admissionRating'))
      .map(dropFields(['ratedBy'])),

    artifact: (await prisma.artifact.findMany({ where: { student: filter } }))
      .map(anonymizeModel('artifact')),

    artifactType: (await prisma.artifactType.findMany({ where: filter }))
      .map(anonymizeModel('artifactType')),

    emailSent: (await prisma.emailSent.findMany({ where: { OR: [{ project: filter }, { student: filter }, { mentor: filter }]} }))
      .map(anonymizeModel('emailSent')),

    event: (await prisma.event.findMany({ where: { id: eventIdFilter } }))
      .map(anonymizeModel('event'))
      .map(dropFields(['emailSignature', 'certificationStatements', 'slackWorkspaceId', 'slackUserGroupId', 'slackMentorChannelId', 'slackWorkspaceAccessToken', 'standupAndProsperToken', 'standupAiModelVaguePending', 'standupAiModelWorkloadPending', ])),

    meeting: (await prisma.meeting.findMany({ where: filter }))
      .map(anonymizeModel('meeting')),

    meetingAttendance: (await prisma.meetingAttendance.findMany({ where: { meeting: filter } }))
      .map(anonymizeModel('meetingAttendance')),

    meetingResponse: (await prisma.meetingResponse.findMany({ where: { meeting: filter } }))
      .map(anonymizeModel('meetingResponse')),

    mentor: (await prisma.mentor.findMany({ where: filter }))
      .map(anonymizeModel('mentor'))
      .map(dropFields(['managerUsername', 'projectPreferences']))
      .map(anonymizeProfile('profile')),

    note: (await prisma.note.findMany({ where: { student: filter } }))
      .map(anonymizeModel('note')).map(dropFields(['note'])),

    project: (await prisma.project.findMany({ where: filter }))
      .map(anonymizeModel('project'))
      .map(dropFields(['issueFetchedAt', 'prFetchedAt', 'prStatusUpdatedAt', 'repositoryId'])),

    projectEmail: (await prisma.projectEmail.findMany({ where: { project: filter } }))
      .map(anonymizeModel('projectEmail'))
      .map(dropFields(['subject', 'to', 'cc', 'textBody', 'htmlBody'])),

    projectPreference: (await prisma.projectPreference.findMany({ where: { student: filter } }))
      .map(anonymizeModel('projectPreference')),

    resource: (await prisma.resource.findMany({ where: filter }))
      .map(anonymizeModel('resource')),

    standupResult: (await prisma.standupResult.findMany({ where: filter }))
      .map(anonymizeModel('standupResult'))
      .map(dropFields(['text', 'humanRated', 'trainingSubmitted'])),

    standupThread: (await prisma.standupThread.findMany({ where: filter }))
      .map(anonymizeModel('standupThread')),

    student: (await prisma.student.findMany({ where: filter }))
      .map(anonymizeModel('student'))
      .map(dropFields(['resumeUrl', 'githubUsername', 'interviewNotes']))
      .map(anonymizeProfile('profile')),

    //survey: (await prisma.survey.findMany()).map(anonymizeModel('survey')).map(dropFields(['slug'])),
    //surveyOccurence: (await prisma.surveyOccurence.findMany()).map(anonymizeModel('surveyOccurence')),
    //surveyResponse: (await prisma.surveyResponse.findMany()).map(anonymizeModel('surveyResponse')),

    tag: (await prisma.tag.findMany())
      .map(anonymizeModel('tag')),

    tagTrainingSubmission: (await prisma.tagTrainingSubmission.findMany({ where: { student: filter } }))
      .map(anonymizeModel('tagTrainingSubmission'))
      .map(dropFields('url')),

    _mentorToProject: (await prisma.$queryRaw<{A: string, B: string}[]>`SELECT "A", "B" FROM "_MentorToProject";`)
      .map(anonymizeMappingModel('mentor', 'project')),

    _projectToStudent: (await prisma.$queryRaw<{A: string, B: string}[]>`SELECT "A", "B" FROM "_ProjectToStudent";`)
      .map(anonymizeMappingModel('project', 'student')),

    _projectToTag: (await prisma.$queryRaw<{A: string, B: string}[]>`SELECT "A", "B" FROM "_ProjectToTag";`)
      .map(anonymizeMappingModel('project', 'tag')),

    _studentToTag: (await prisma.$queryRaw<{A: string, B: string}[]>`SELECT "A", "B" FROM "_StudentToTag";`)
      .map(anonymizeMappingModel('student', 'tag')),
  };
}

(async () => {
  const prisma = new PrismaClient();

  const results = {
    labs: await dumpTables(prisma, { startsWith: 'codeday-labs-' }),
    init: await dumpTables(prisma, { startsWith: 'codeday-init-' }),
    all: await dumpTables(prisma, { not: 'NOOP' }),
  };

  const dt = DateTime.now().toISO().replace(/[^a-zA-Z0-9]/g, '-');

  Object.entries(results)
    .forEach(([type, tables]) => {
      Object.entries(tables)
        .forEach(([table, rows]) => writeTable(`${dt}/${type}/${table}.csv`, rows));
    });
})();