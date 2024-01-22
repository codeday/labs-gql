import { PersonType, PrismaClient, Survey, Mentor, Student, SurveyOccurence } from "@prisma/client";
import { DateTime } from "luxon";
import { Transporter } from "nodemailer";
import Container from "typedi";
import { getTemplate } from "../../email";
import { Marked } from "@ts-stack/markdown";
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:emailDueSurveysReminder');

export const JOBSPEC = '*/5 * * * *';

interface SurveyReminderContext {
  to: Mentor | Student,
  surveyOccurence: SurveyOccurence,
  survey: Survey,
};

export default async function emailDueSurveysReminder(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const outdated = DateTime.now().minus({ days: 6 }).toJSDate();
  const email = await Container.get<Transporter>('email');

  const tplDue = await getTemplate<SurveyReminderContext>('surveyDue.md');
  const tplOverdue = await getTemplate<SurveyReminderContext>('surveyOverdue.md');


  const visibleSurveys = await prisma.surveyOccurence.findMany({
    where: {
      survey: { event: { isActive: true } },
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
    include: { survey: { include: { event: true } } },
  });

  DEBUG(`Sending emails for ${visibleSurveys.length} surveys.`);

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
    DEBUG(`Sending survey reminder for ${visibleSurvey.survey.name} to ${targets.length} targets.`);

    const friendlyDate = DateTime.fromJSDate(visibleSurvey.dueAt).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY) 
    const subject = `[Action Required] ${visibleSurvey.survey.name} due ${friendlyDate}`;
    const template = visibleSurvey.sentVisibleReminder ? tplOverdue : tplDue;

    await prisma.surveyOccurence.update({
      where: { id: visibleSurvey.id },
      data: (visibleSurvey.sentVisibleReminder ? { sentOverdueReminder: true } : { sentVisibleReminder: true }),
    });

    for (const target of targets) {
      DEBUG(`Sending ${subject} to ${target.email}`);
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