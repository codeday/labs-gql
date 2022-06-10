import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { AuthContext } from "../context";
import { IdOrUsernameInput } from "../inputs";
import { idOrUsernameToUniqueWhere } from './idOrUsernameToUniqueWhere';

export async function validateStudentEvent(auth: AuthContext, arg: IdOrUsernameInput): Promise<void> {
  const student = await Container.get(PrismaClient).student.findUnique({
    where: idOrUsernameToUniqueWhere(auth, arg),
  });
  if (student && student.eventId !== auth.eventId) throw new Error('Student event does not match token event.');
}

export async function validateMentorEvent(auth: AuthContext, arg: IdOrUsernameInput): Promise<void> {
  const mentor = await Container.get(PrismaClient).mentor.findUnique({
    where: idOrUsernameToUniqueWhere(auth, arg),
  });
  if (mentor && mentor.eventId !== auth.eventId) throw new Error('Mentor event does not match token event.');
}

export async function validateProjectEvent(auth: AuthContext, id: string): Promise<void> {
  const project = await Container.get(PrismaClient).project.findUnique({
    where: { id },
  });
  if (project && project.eventId !== auth.eventId) throw new Error('Project event does not match token event.');
}
