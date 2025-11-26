import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import Container from "typedi";
import { AuthContext, AuthRole } from "../context";
import { StudentStatus, MentorStatus, ProjectStatus } from '../enums';

export async function validateActive(auth: AuthContext) {
  if (!auth.isStudent && !auth.isMentor) throw new Error('Not a student or mentor token.');
  if (auth.isStudent) {
    const me = await Container.get(PrismaClient).student.findUniqueOrThrow({
      where: auth.toWhere(),
      include: { event: true },
      rejectOnNotFound: true,
    });

    if (me.status !== StudentStatus.ACCEPTED) throw new Error(`Not an active participant.`);
    if (DateTime.fromJSDate(me.event.startsAt).plus({ weeks: me.weeks }) < DateTime.now()) {
      throw new Error(`Participation ended.`)
    }
  } else if (auth.isMentor) {
    const me = await Container.get(PrismaClient).mentor.findUniqueOrThrow({
      where: auth.toWhere(),
      include: { event: true, projects: { where: { status: { in: [ProjectStatus.MATCHED, ProjectStatus.ACCEPTED] } } } },
      rejectOnNotFound: true,
    });
    if (me.status !== MentorStatus.ACCEPTED) throw new Error(`Not an active mentor.`);
    if (me.projects.length === 0) throw new Error(`No active projects.`);
    if (DateTime.fromJSDate(me.event.startsAt).plus({ weeks: me.maxWeeks + 2 }) < DateTime.now()) {
      throw new Error(`Participation ended.`)
    }
  }
}
