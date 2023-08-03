import { sendEmailsForGenerator, getEmailGenerators } from "../../email";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:emailSend');

export const JOBSPEC = '*/5 * * * *';

export default async function emailSend() {
  DEBUG('Checking for emails to send.');
  for (const generator of await getEmailGenerators()) {
    await sendEmailsForGenerator(generator);
  }
}