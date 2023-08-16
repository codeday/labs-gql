/* eslint-disable no-continue, no-await-in-loop */
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import { Container } from 'typedi';
import { Mentor, PrismaClient, Student, Event } from '@prisma/client';
import { Transporter } from 'nodemailer';
import { EmailGenerator } from './loader';
import { EmailContext } from './spec';
import config from '../config';
import path from 'path';
import { readFile } from 'fs/promises';
import { makeDebug } from "../utils";

const DEBUG = makeDebug('email');

export * from './loader';

export async function getTemplate<T>(
  template: string
): Promise<HandlebarsTemplateDelegate<T>> {
  return handlebars.compile<T>(await getTemplateFile(template));
}

async function getTemplateFile(template: string): Promise<string> {
  const buffer = await readFile(path.join(config.app.emailTemplateDir, template));
  return buffer.toString();
}

async function sendEmailForContext(emailId: string, generator: EmailGenerator, context: EmailContext): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const email = await Container.get<Transporter>('email');
  const { frontMatter, html, text } = await generator.template(context);
  try {
    DEBUG(`Sending email "${frontMatter.subject}" to ${frontMatter.to}.`);
    await email.sendMail({ ...frontMatter, html, text });
    await prisma.emailSent.create({
      data: {
        emailId,
        mentor: context.mentor ? { connect: { id: context.mentor.id } } : undefined,
        student: context.student ? { connect: { id: context.student.id } } : undefined,
        project: context.project ? { connect: { id: context.project.id } } : undefined,
      },
    });
  } catch (ex) {
    DEBUG(ex);
  }
}

export async function sendEmailsForGenerator(generator: EmailGenerator): Promise<void> {
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

  DEBUG(`* ${emailId}: ${newContexts.length} emails to send.`);

  for (const context of newContexts) await sendEmailForContext(emailId, generator, context);
}


export async function sendLoginLinks(
  to: string,
  mentors: (Mentor & { event: Event })[],
  students: (Student & { event: Event })[],
): Promise<void> {
  const email = await Container.get<Transporter>('email');

  const loginLink = await readFile(path.join(__dirname, 'templates', 'loginLink.md'));
  const loginNone = await readFile(path.join(__dirname, 'templates', 'loginNone.md'));
  const tplLink = await handlebars.compile(loginLink.toString());
  const tplNone = await handlebars.compile(loginNone.toString());

  const template = (mentors.length > 0 || students.length > 0)
    ? tplLink
    : tplNone;
  const renderedTemplate = template({ mentors, students });

  await email.sendMail({
    to,
    from: 'labs@codeday.org',
    subject: 'CodeDay Labs Dashboard Login Link',
    text: renderedTemplate,
    html: Marked.parse(renderedTemplate),
  });
}