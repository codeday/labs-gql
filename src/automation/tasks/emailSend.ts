import Container from "typedi";
import { sendEmailsForGenerator, getEmailGenerators } from "../../email";
import { makeDebug } from "../../utils";
import { PrismaClient } from "@prisma/client";

const DEBUG = makeDebug('automation:tasks:emailSend');

export const JOBSPEC = '*/5 * * * *';

export default async function emailSend() {
  DEBUG('Checking for emails to send.');
  const prisma = Container.get(PrismaClient);
  const events = await prisma.event.findMany({
    where: { isActive: true },
    select: { id: true, name: true, emailSignature: true, title: true },
  });
  for (const event of events) {
    for (const generator of await getEmailGenerators()) {
      await sendEmailsForGenerator(generator, event);
    }
  }
}