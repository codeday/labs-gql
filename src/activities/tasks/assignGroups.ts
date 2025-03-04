import { PrismaClient, Project, ProjectStatus, Student, StudentStatus } from "@prisma/client";
import { Context } from "../../context";
import Container from "typedi";
import { makeDebug, maxFunction } from "../../utils";

const DEBUG = makeDebug('app:activities:tasks:assignGroups');

type ProjectsSelect = (Project & { students: Student[] })[];

const ALGORITHMS = [
    'random'
] as const;

const ALGORITHMS_FUNCTIONS: Record<typeof ALGORITHMS[number], (students: Student[], projects: ProjectsSelect) => Record<string, string[]>> = {
  random: algorithmRandom,
}

export interface AssignGroupsArgs {
  algorithm: typeof ALGORITHMS[number]
}

export const SCHEMA = {
  type: 'object',
  required: ['algorithm'],
  properties: {
    algorithm: {
      type: 'string',
      title: 'Algorithm',
      enum: ALGORITHMS,
      enumNames: ALGORITHMS,
    },
  },
}


export default async function assignGroups({ auth }: Context, args: Partial<AssignGroupsArgs> | undefined): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const projects = await prisma.project.findMany({
    where: {
      eventId: auth.eventId!,
      status: ProjectStatus.ACCEPTED,
    },
    include: { students: true },
  });
  
  const students = await prisma.student.findMany({
    where: {
      eventId: auth.eventId!,
      status: StudentStatus.ACCEPTED,
      projects: { none: {} },
    },
  });

  const projectAssignments = ALGORITHMS_FUNCTIONS[args!.algorithm!](students, projects);
  DEBUG('Project assigments:', projectAssignments);

  for (const projectId in projectAssignments) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        students: { connect: projectAssignments[projectId].map(id => ({ id })) },
      },
    });
  }
}

function algorithmRandom(students: Student[], projects: ProjectsSelect): Record<string, string[]> {
  const projectAssignments: Record<string, string[]> = Object.fromEntries(projects.map(p => [p.id, []]));

  for (const student of students) {
    DEBUG(`Assigning ${student.givenName}`);
    const remainingProjects = projects
      .filter(p => (p.students.length + projectAssignments[p.id].length) < p.maxStudents);

    const mostCapacity = maxFunction(
      remainingProjects,
      p => p.maxStudents - (p.students.length + projectAssignments[p.id].length)
    );

    if (!mostCapacity) continue;
    projectAssignments[mostCapacity.id].push(student.id);
  }

  return projectAssignments;
}