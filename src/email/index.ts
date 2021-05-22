/* eslint-disable no-continue, no-await-in-loop */
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import { getEmailGenerators, EmailGenerator } from './loader';
import { EmailContext } from './spec';

Handlebars.registerHelper('fallback', (value, safeValue) => {
  const out = value || safeValue;
  return new Handlebars.SafeString(out);
});

async function sendEmailForContext(emailId: string, generator: EmailGenerator, context: EmailContext): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const email = await Container.get<Transporter>('email');
  const { frontMatter, html, text } = await generator.template(context);
  await email.sendMail({ ...frontMatter, html, text });
  await prisma.emailSent.create({
    data: {
      emailId,
      mentor: context.mentor ? { connect: { id: context.mentor.id } } : undefined,
      student: context.student ? { connect: { id: context.student.id } } : undefined,
      project: context.project ? { connect: { id: context.project.id } } : undefined,
    },
  });
}

async function sendEmailsForGenerator(generator: EmailGenerator): Promise<void> {
  const prisma = Container.get(PrismaClient);

  const emailId = await generator.getId();
  const contexts = await generator.getList(prisma);
  if (!emailId || !contexts) return;

  const previousById = await prisma.emailSent.findMany({
    select: { mentorId: true, studentId: true, projectId: true },
    where: { emailId },
  });

  const newContexts = contexts.filter((context) => (
    (context.mentor || context.student || context.project)
    && !previousById.reduce((accum, prev) => accum || (
      (context.mentor?.id || null) === prev.mentorId
      && (context.student?.id || null) === prev.studentId
      && (context.project?.id || null) === prev.projectId
    ), false)
  ));

  for (const context of newContexts) await sendEmailForContext(emailId, generator, context);
}

export async function sendEmails(): Promise<void> {
  for (const generator of await getEmailGenerators()) await sendEmailsForGenerator(generator);
}

export default function emailHandler(): void {
  setInterval(sendEmails, 300000);
  sendEmails();
}
