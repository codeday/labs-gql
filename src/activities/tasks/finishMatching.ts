import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';

export default async function finishMatching({ auth }: Context): Promise<void> {
  if (!auth.eventId) throw new Error('An event must be specified to finish matching.');
  const prisma = Container.get(PrismaClient);
  await prisma.event.updateMany({
    where: {
      id: auth.eventId,
    },
    data: {
      matchComplete: true,
    },
  });
}
