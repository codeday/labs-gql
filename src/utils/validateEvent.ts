import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { AuthContext } from "../context";
import { IdOrUsernameInput, IdOrUsernameOrEmailInput } from "../inputs";
import { idOrUsernameOrEmailToUniqueWhere, idOrUsernameToUniqueWhere } from './idOrUsernameToUniqueWhere';

export async function validateStudentEvent(auth: AuthContext, arg: IdOrUsernameInput | IdOrUsernameOrEmailInput): Promise<void> {
  const student = await Container.get(PrismaClient).student.findUnique({
    where: idOrUsernameOrEmailToUniqueWhere(auth, arg),
  });
  if (student && student.eventId !== auth.eventId) throw new Error('Student event does not match token event.');
}

export async function validatePartnerStudent(auth: AuthContext, arg: IdOrUsernameInput | IdOrUsernameOrEmailInput): Promise<void> {
  const student = await Container.get(PrismaClient).student.findUnique({
    where: idOrUsernameOrEmailToUniqueWhere(auth, arg),
  });
  if (student &&
      (!student.partnerCode || student.partnerCode.toLowerCase() !== auth.partnerCode?.toLowerCase())
  ) {
      throw new Error('Partner code does not match.');
  }
}

export async function validateMentorEvent(auth: AuthContext, arg: IdOrUsernameInput | IdOrUsernameOrEmailInput ): Promise<void> {
  const mentor = await Container.get(PrismaClient).mentor.findUnique({
    where: idOrUsernameOrEmailToUniqueWhere(auth, arg),
  });
  if (mentor && mentor.eventId !== auth.eventId) throw new Error('Mentor event does not match token event.');
}

export async function validateProjectEvent(auth: AuthContext, id: string): Promise<void> {
  const project = await Container.get(PrismaClient).project.findUnique({
    where: { id },
  });
  if (project && project.eventId !== auth.eventId) throw new Error('Project event does not match token event.');
}

export async function validateSurveyEvent(auth: AuthContext, id: string): Promise<void> {
  const survey = await Container.get(PrismaClient).survey.findUnique({
    where: { id },
  });
  if (survey && survey.eventId !== auth.eventId) throw new Error('Survey event does not match token event.');
}
