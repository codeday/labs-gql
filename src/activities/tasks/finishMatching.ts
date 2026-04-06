import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';

export default async function finishMatching({ auth }: Context): Promise<void> {
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
