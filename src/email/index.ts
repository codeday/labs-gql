/* eslint-disable no-continue, no-await-in-loop */
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import fs from 'fs';
import { Container } from 'typedi';
import { Mentor, PersonType, PrismaClient, Student, Event } from '@prisma/client';
import { Transporter } from 'nodemailer';
import { DateTime } from 'luxon';
import { getEmailGenerators, EmailGenerator } from './loader';
import { EmailContext } from './spec';
import config from '../config';
import path from 'path';

async function sendEmailForContext(emailId: string, generator: EmailGenerator, context: EmailContext): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const email = await Container.get<Transporter>('email');
  const { frontMatter, html, text } = await generator.template(context);
  try {
    // eslint-disable-next-line no-console
    console.log(`Sending email "${frontMatter.subject}" to ${frontMatter.to}.`);
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
    // eslint-disable-next-line no-console
    console.error(ex);
  }
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

async function sendDueSurveysReminder(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const outdated = DateTime.now().minus({ days: 6 }).toJSDate();
  const email = await Container.get<Transporter>('email');

  const mdDue = await fs.promises.readFile(path.join(__dirname, 'templates', 'surveyDue.md'));
  const mdOverdue = await fs.promises.readFile(path.join(__dirname, 'templates', 'surveyOverdue.md'));
  const tplDue = await handlebars.compile(mdDue.toString());
  const tplOverdue = await handlebars.compile(mdOverdue.toString());

  const visibleSurveys = await prisma.surveyOccurence.findMany({
    where: {
      OR: [
        {
          AND: [
            { visibleAt: { gt: outdated } },
            { visibleAt: { lt: DateTime.now().toJSDate() } },
            { sentVisibleReminder: false },
          ],
        },
        {
          AND: [
            { dueAt: { gt: outdated } },
            { dueAt: { lt: DateTime.now().toJSDate() } },
            { sentOverdueReminder: false },
          ],
        },
      ],
    },
    include: { survey: true },
  });

  for (const visibleSurvey of visibleSurveys) {
    let targets: (Student | Mentor)[] = [];
    if (visibleSurvey.survey.personType === PersonType.MENTOR) {
      targets = await prisma.mentor.findMany({
        where: {
          projects: { some: { status: 'MATCHED', students: { some: { status: 'ACCEPTED' } } } },
          status: 'ACCEPTED',
          authoredSurveyResponses: { none: { surveyOccurenceId: visibleSurvey.id } },
          eventId: visibleSurvey.survey.eventId,
        },
      });
    } else {
      targets = await prisma.student.findMany({
        where: {
          projects: { some: { status: 'MATCHED', mentors: { some: { status: 'ACCEPTED' } } } },
          status: 'ACCEPTED',
          authoredSurveyResponses: { none: { surveyOccurenceId: visibleSurvey.id } },
          eventId: visibleSurvey.survey.eventId,
        },
      });
    }
    console.log(`Sending survey reminder for ${visibleSurvey.survey.name} to ${targets.length} targets.`);

    const friendlyDate = DateTime.fromJSDate(visibleSurvey.dueAt).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY) 
    const subject = `[Action Required] ${visibleSurvey.survey.name} due ${friendlyDate}`;
    const template = visibleSurvey.sentVisibleReminder ? tplOverdue : tplDue;

    await prisma.surveyOccurence.update({
      where: { id: visibleSurvey.id },
      data: (visibleSurvey.sentVisibleReminder ? { sentOverdueReminder: true } : { sentVisibleReminder: true }),
    });

    for (const target of targets) {
      console.log(`Sending ${subject} to ${target.email}`);
      const renderedTemplate = template({ surveyOccurence: visibleSurvey, survey: visibleSurvey.survey, to: target });
      await email.sendMail({
        to: `"${target.givenName} ${target.surname}" <${target.email}>`,
        from: 'labs@codeday.org',
        subject: subject,
        text: renderedTemplate,
        html: Marked.parse(renderedTemplate),
      });
    }
  }
}

export async function sendLoginLinks(
  to: string,
  mentors: (Mentor & { event: Event })[],
  students: (Student & { event: Event })[],
): Promise<void> {
  const email = await Container.get<Transporter>('email');

  const loginLink = await fs.promises.readFile(path.join(__dirname, 'templates', 'loginLink.md'));
  const loginNone = await fs.promises.readFile(path.join(__dirname, 'templates', 'loginNone.md'));
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

export async function sendEmails(): Promise<void> {
  console.log(`Checking for emails to send.`);
  for (const generator of await getEmailGenerators()) await sendEmailsForGenerator(generator);
  await sendDueSurveysReminder();
}

export default function emailHandler(): void {
  setInterval(sendEmails, 1000 * 60 * (config.debug ? 0.5 : 5));
  sendEmails();
}
