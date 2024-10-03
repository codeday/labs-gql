import Container from "typedi";
import { sendEmailsForGenerator, getEmailGenerators } from "../../email";
import { makeDebug } from "../../utils";
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const DEBUG = makeDebug('automation:tasks:emailSend');

export const JOBSPEC = '*/10 * * * *';

export default async function emailSend() {
  DEBUG('Checking for emails to send.');
  const prisma = Container.get(PrismaClient);
  const events = await prisma.event.findMany({
    select: { id: true, name: true, emailSignature: true, title: true, startsAt: true, defaultWeeks: true, isActive: true },
  });
  for (const event of events) {
    const weeksSinceDefaultEnd = -1 * (
      DateTime
        .fromJSDate(event.startsAt)
        .plus({ weeks: event.defaultWeeks })
        .diffNow('week')
        .weeks
    );
    for (const generator of await getEmailGenerators()) {
      if (event.isActive || (generator.ALLOW_INACTIVE && weeksSinceDefaultEnd < 8)) {
        await sendEmailsForGenerator(generator, event);
      }
    }
  }
}