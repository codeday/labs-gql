import Container from "typedi";
import { sendEmailsForGenerator, getEmailGenerators } from "../../email";
import { makeDebug } from "../../utils";
import { PrismaClient } from "@prisma/client";

const DEBUG = makeDebug('automation:tasks:emailSend');

export const JOBSPEC = '*/10 * * * *';

export default async function emailSend() {
  DEBUG('Checking for emails to send.');
  const prisma = Container.get(PrismaClient);
  const events = await prisma.event.findMany({
    select: { id: true, name: true, emailSignature: true, title: true, startsAt: true, defaultWeeks: true, isActive: true },
  });
  for (const event of events) {
    for (const generator of await getEmailGenerators()) {
      if (generator.ALLOW_INACTIVE || event.isActive) {
        await sendEmailsForGenerator(generator, event);
      }
    }
  }
}