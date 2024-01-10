import { PrismaClient, StudentStatus } from "@prisma/client";
import Container from "typedi";
import { APIError } from 'openai';
import { StandupWithModel, getProjectStandupScore } from "../../openai";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:aiScoreStandups');

export const JOBSPEC = '30 * * * *';

async function scoreProjectStandup(
  standup: StandupWithModel
): Promise<void> {
  const prisma = Container.get(PrismaClient);
  try {
    const rating = await getProjectStandupScore(standup);

    DEBUG(`Standup ${standup.id} was scored ${rating}`);

    await prisma.standupResult.update({
      where: { id: standup.id },
      data: { rating },
    });
  } catch (ex) {
    if (ex instanceof APIError) {
      DEBUG(ex.message);
    } else {
      DEBUG(ex);
    }
  }
}

export default async function aiScoreStandups() {
  const prisma = Container.get(PrismaClient);
  const standups = await prisma.standupResult.findMany({
    where: {
      event: {
        isActive: true,
        standupAiModelVague: { not: null, contains: ':' },
        standupAiModelWorkload: { not: null, contains: ':' },
      },
      student: { status: StudentStatus.ACCEPTED },
      humanRated: false,
      rating: null,
    },
    include: {
      event: { select: { standupAiModelVague: true, standupAiModelWorkload: true } },
    },
  }) as StandupWithModel[];

  DEBUG(`Scoring ${standups.length} standups.`);

  for (const standup of standups) {
    await scoreProjectStandup(standup);
  }
}