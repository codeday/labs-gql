/* eslint-disable no-continue, no-await-in-loop */
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import { Container } from 'typedi';
import { Mentor, PrismaClient, Student, Event, Project } from '@prisma/client';
import { Transporter } from 'nodemailer';
import { EmailGenerator, PartialEvent } from './loader';
import { EmailContext } from './spec';
import config from '../config';
import path from 'path';
import { readFile } from 'fs/promises';
import { makeDebug } from "../utils";

const DEBUG = makeDebug('email');

export * from './loader';
export * from './postmark';

export async function getTemplate<T>(
  template: string
): Promise<HandlebarsTemplateDelegate<T>> {
  return handlebars.compile<T>(await getTemplateFile(template));
}

async function getTemplateFile(template: string): Promise<string> {
  const buffer = await readFile(path.join(config.app.emailTemplateDir, template));
  return buffer.toString();
}

async function sendEmailForContext(
  emailId: string,
  generator: EmailGenerator,
  context: EmailContext,
  event: PartialEvent
): Promise<void> {

  const prisma = Container.get(PrismaClient);
  const email = await Container.get<Transporter>('email');
  const { frontMatter, html, text } = await generator.template({ ...context, event });

  try {
    DEBUG(`Sending email "${frontMatter.subject}" to ${frontMatter.to}.`);
    const { id: emailSentId } = await prisma.emailSent.create({
      data: {
        emailId,
        mentor: context.mentor ? { connect: { id: context.mentor.id } } : undefined,
        student: context.student ? { connect: { id: context.student.id } } : undefined,
        project: context.project ? { connect: { id: context.project.id } } : undefined,
      },
      select: { id: true },
    });

    const projectTrackingEmail = context.project && `${context.project.id}+${emailSentId}@${config.email.inboundDomain}`;
    const from = frontMatter.from || (context.project ? projectTrackingEmail : config.email.from);

    await email.sendMail({
      ...frontMatter,
      html,
      text,
      from: from === projectTrackingEmail ? `"${event.name}" <${from}>` : from,
      bcc: [frontMatter.bcc].filter(Boolean) as string[],
      cc: [
        frontMatter.cc,
        context.project && from !== projectTrackingEmail && projectTrackingEmail,
      ].filter(Boolean) as string[],
    });
  } catch (ex) {
    DEBUG(ex);
  }
}

export async function sendEmailsForGenerator(
  generator: EmailGenerator,
  event: PartialEvent
): Promise<void> {
  const prisma = Container.get(PrismaClient);

  const emailId = await generator.getId();
  const contexts = await generator.getList(prisma, event);

  if (!emailId || !contexts || contexts.length === 0) return;

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

  if (newContexts.length > 0) DEBUG(`* ${emailId}: ${newContexts.length} emails to send.`);

  for (const context of newContexts) await sendEmailForContext(emailId, generator, context, event);
}

export async function sendTemplateEmail(
  templateName: string,
  context: object,
  subject: string,
  to: { email: string, id: string, event: PartialEvent }[],
): Promise<void> {
  DEBUG(`Sending ${templateName} email.`);
  const email = Container.get<Transporter>('email');

  const templateFile = await readFile(path.join(__dirname, 'templates', `${templateName}.md`))
  const template = await handlebars.compile(templateFile.toString());

  for (const person of to) {
    const renderedTemplate = template({ ...context, to: person });

    await email.sendMail({
      to: [person.email],
      from: config.email.from,
      subject,
      text: renderedTemplate,
      html: Marked.parse(renderedTemplate),
    });
  }
}

export async function sendTemplateEmailRaw(
  templateName: string,
  context: object,
  subject: string,
  to: string[],
): Promise<void> {
  DEBUG(`Sending ${templateName} email.`);
  const email = Container.get<Transporter>('email');

  const templateFile = await readFile(path.join(__dirname, 'templates', `${templateName}.md`))
  const template = await handlebars.compile(templateFile.toString());
  const renderedTemplate = template(context);

  await email.sendMail({
    to,
    from: config.email.from,
    subject,
    text: renderedTemplate,
    html: Marked.parse(renderedTemplate),
  });
}

export async function sendProjectUpdate(
  to: string[],
  oldProject: Project,
  newProject: Project,
): Promise<void> {
  return sendTemplateEmailRaw(
    'projectUpdate',
    { oldProject, newProject },
    'Project Information Updated',
    to
  );
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
    from: config.email.from,
    subject: 'Dashboard Login Link',
    text: renderedTemplate,
    html: Marked.parse(renderedTemplate),
  });
}

export async function sendGiftcard(
  to: string,
  event: Event,
  amount: string,
  code: string,
  reason: string,
  link: string,
  featuredProduct?: string,
): Promise<void> {
  const email = await Container.get<Transporter>('email');

  const tplString = await readFile(path.join(__dirname, 'templates', 'giftCard.md'));
  const tpl = await handlebars.compile(tplString.toString());

  const renderedTemplate = tpl({ amount, code, reason, link, event, featuredProduct });

  await email.sendMail({
    to,
    from: config.email.from,
    subject: 'CodeDay Gift Card',
    text: renderedTemplate,
    html: Marked.parse(renderedTemplate),
  });
}