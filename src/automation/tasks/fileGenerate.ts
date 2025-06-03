import { Event, Mentor, Student,Project, FileType, File, FileTypeGenerationCondition, FileTypeGenerationTarget, PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { makeDebug } from "../../utils";
import { DateTime } from 'luxon';
import { generateMedia } from '../../placid';

const DEBUG = makeDebug('automation:tasks:fileGenerate');

export const JOBSPEC = '*/10 * * * *';

type DeepProject = Project & { mentors: Mentor[], students: Student[] }
type WithDeepProject<T> = T & { projects: DeepProject[] };
function isStudent(obj: WithDeepProject<Mentor> | WithDeepProject<Student>): obj is WithDeepProject<Student> { return 'weeks' in obj }

async function generateFileForIndividuals(
  fileType: FileType,
  event: Event,
  individuals: (WithDeepProject<Mentor> | WithDeepProject<Student>)[],
  existingFiles: File[]
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const now = DateTime.now();
  
  for (const individual of individuals) {
    // Check if the event is over if the condition is Completed
    const weeks = isStudent(individual)
      ? individual.weeks
      : Math.max(0, ...individual.projects.flatMap(p => p.students).map(s => s.weeks));

    if (
      fileType.generationCondition === FileTypeGenerationCondition.COMPLETED
      && now < DateTime.fromJSDate(event.startsAt).plus({ weeks: weeks || event.defaultWeeks || 4 })
    ) { continue; }

    // Check if the file has already been created
    if (
      existingFiles
        .some(f => 
          isStudent(individual)
            ? f.studentId === individual.id
            : f.mentorId === individual.id
            )
    ) { continue; }

    DEBUG(`Creating file ${fileType.id} for ${isStudent(individual) ? 'student' : 'mentor'} ${individual.id}`);

    const pollingUrl = await generateMedia(
      fileType.templateId,
      fileType.type,
      fileType.layers as object,
      { [isStudent(individual) ? 'student' : 'mentor']: individual, event }
    );

    await prisma.file.create({
      data: {
        pollingUrl,
        [isStudent(individual) ? 'studentId' : 'mentorId']: individual.id,
        fileTypeId: fileType.id,
      }
    });
  }
}

async function generateFileForProjects(
    fileType: FileType,
    event: Event,
    projects: DeepProject[],
    existingFiles: File[]
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const now = DateTime.now();

  for (const project of projects) {
    // Check if the event is over if the condition is Completed
    const weeks = Math.max(0, ...project.students.map(s => s.weeks));
    if (
      fileType.generationCondition === FileTypeGenerationCondition.COMPLETED
      && now < DateTime.fromJSDate(event.startsAt).plus({ weeks: weeks || event.defaultWeeks || 4 })
    ) { continue; }

    // Check if the file has already been created
    if (existingFiles.some(f => f.projectId === project.id)) { continue; }

    DEBUG(`Creating file ${fileType.id} for project ${project.id}`);

    const pollingUrl = await generateMedia(
      fileType.templateId,
      fileType.type,
      fileType.layers as object,
      { project, event }
    );

    await prisma.file.create({
      data: {
        pollingUrl,
        projectId: project.id,
        fileTypeId: fileType.id,
      }
    });
  }
}

export default async function fileGenerate(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const now = new Date();

  const includeMentorsStudents = { include: { students: { where: { status: 'ACCEPTED' }}, mentors: { where: { status: 'ACCEPTED' } } } };

  const fileTypes = await prisma.fileType.findMany({
    where: {
      event: { isActive: true },
    },
    include: {
      event: {
        include: {
          mentors: { where: { status: 'ACCEPTED' }, include: { projects: { ...(includeMentorsStudents as any) } } },
          students: { where: { status: 'ACCEPTED'},  include: { projects: { ...(includeMentorsStudents as any) } } },
          projects: { where: { status: 'MATCHED' }, ...(includeMentorsStudents as any)},
        }
      },
      files: true,
    }
  });

  for (const fileType of fileTypes) {
    const { mentors, students, projects, ...event } = fileType.event;
    if (
      fileType.generationCondition === FileTypeGenerationCondition.STARTED
      && now < fileType.event.startsAt
    ) { continue; }

    switch (fileType.generationTarget) {
      case FileTypeGenerationTarget.STUDENT:
        await generateFileForIndividuals(
          fileType,
          event,
          students as WithDeepProject<Student>[],
          fileType.files
        );
        break;
      case FileTypeGenerationTarget.MENTOR:
        await generateFileForIndividuals(
          fileType,
          event,
          mentors as WithDeepProject<Mentor>[],
          fileType.files
        );
        break;
    }
  }

};