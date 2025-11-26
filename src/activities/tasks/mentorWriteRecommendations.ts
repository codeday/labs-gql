import { Event, PrismaClient } from "@prisma/client";
import Container from "typedi";
import OpenAIApi from "openai";
import { Context } from '../../context';
import { PickNonNullable, makeDebug } from "../../utils";
import { stringify } from 'csv-stringify/sync';
import { DateTime } from "luxon";
import { getSlackClientForEvent } from "../../slack";

const GPT_SYSTEM = `
You are an assistant working for an education non-profit called CodeDay.

At CodeDay, we match college students with mentors to help them make real-world
contributions to open-source software projects. Mentors guide a team of 2-4
students as they build an real-world project in several weeks. They lead the
students through design, implementation, test, completion, and presentation of
the project. Through this internship-style experience, mentors give students
their first sustained hands-on experience working with an industry professional.
They help them learn project management, team work, communications, modern
technical skills, and standard industry practices.

The program helps the mentors who complete it to grow in their own professional
careers:

Leadership Skills Development: Mentoring is a hands-on opportunity to develop
leadership skills, such as guiding a less experienced person, making decisions,
and providing constructive feedback. These are crucial skills for any career
advancement, particularly in management or team lead roles.

Communication Skills: Explaining complex concepts to someone new to the field
forces a mentor to refine their communication skills. This practice is
invaluable as clear communication is essential for collaborating with
colleagues, presenting ideas, and writing documentation

Strengthening Knowledge: Teaching someone else is one of the best ways to
reinforce one’s own knowledge. Mentors often find they gain a deeper
understanding of subjects they thought they knew well because they need to
address questions and challenges posed by the intern.

Empathy and Patience: Working closely with an intern can develop a mentor's
patience and empathy—qualities that are essential for teamwork and leadership.
Understanding and addressing someone else’s needs and learning styles can
improve a developer's interpersonal skills and emotional intelligence.
`;

const GPT_PROMPT = `I am a manager for CodeDay and need your help to write a
LinkedIn recommendation for one of our mentors. Please write a one-paragraph
recommendation suitable for LinkedIn based on the information provided. Use
relatively informal language. The recommendation should follow the following
format: 

Explain that I know the mentor through their work mentoring our students.
Briefly explain what CodeDay Labs is in 1 sentence.
Give my recommendation for the mentor. (Please do not recommend them for any particular roles.)
Describe what skills the mentor demonstrated as a result of the project.
Summarize positive feedback from their students, if anything.
`;

const DEBUG = makeDebug('activities:tasks:mentorWriteRecommendations');


interface MentorWriteRecommendationsArgs {
  channel: string
}

export const SCHEMA = {
  type: 'object',
  required: ['channel'],
  properties: {
    channel: {
      type: 'string',
      title: 'Channel ID to send the generated result',
    },
  },
}

export default async function mentorWriteRecommendations({ auth }: Context, args: Partial<MentorWriteRecommendationsArgs> | undefined): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const openAi = Container.get(OpenAIApi);

  if (!args || !args.channel) throw new Error(`Must specify channel in arguments.`);

  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: auth.eventId!,
      slackWorkspaceId: { not: null },
      slackWorkspaceAccessToken: { not: null },
    },
  }) as PickNonNullable<Event, 'id' | 'slackWorkspaceId' | 'slackWorkspaceAccessToken' | 'name'>;

const mentors = await prisma.mentor.findMany({
  where: {
    eventId: auth.eventId,
    status: 'ACCEPTED',
    projects: { some: { status: 'MATCHED' } },
  },
  include: {
    event: true,
    projects: { where: { status: 'MATCHED' }, include: { students: { where: { status: 'ACCEPTED' } } } },
    targetSurveyResponses: { where: { authorStudentId: { not: null } } },
  }
});

const recommendations = []
for (const mentor of mentors) {
  DEBUG(`Creating recommendation for ${mentor.givenName} ${mentor.surname}.`);
  const previousParticipation = await prisma.mentor.findMany({
    where: {
      eventId: { not: auth.eventId },
      status: 'ACCEPTED',
      projects: { some: { status: 'MATCHED' } },
      OR: [
        { email: mentor.email },
        { givenName: mentor.givenName, surname: mentor.surname },
        ...(mentor.username ? [{ username: mentor.username }] : [{}]),
      ],
    },
    include: {
      event: true,
      projects: { where: { status: 'MATCHED' }, include: { students: { where: { status: 'ACCEPTED' } } } },
      targetSurveyResponses: { where: { authorStudentId: { not: null } } },
    }
  });

  const allMentorship = [
    mentor,
    ...previousParticipation,
  ]
    .map(m => ({
      ...m,
      startsAtDateString: DateTime.fromJSDate(m.event.startsAt).toLocaleString(DateTime.DATE_MED),
      endsAtDateString: DateTime.fromJSDate(m.event.startsAt).plus({ weeks: m.maxWeeks || 5 }).toLocaleString(DateTime.DATE_MED)
    }));

  const allSurveyResponsesAbout = allMentorship.flatMap(p => p.targetSurveyResponses);
  const surveyResponsesFreeResponse = allSurveyResponsesAbout
    .flatMap(sr => Object.entries(sr.response as object))
    .filter(([, v]) => typeof v === 'string' && v.length > 20)
    .map(([k, v]) => `- ${k}: ${v.replace(/(\r\n|\n|\r)/gm, " ")}`)
    .slice(0, 20)
    .join(`\n`);

  const allMentoredStudents = allMentorship
    .flatMap(m => m.projects)
    .flatMap(p => p.students);

  const mentorInformation = {
    'Recommendation For': `${mentor.givenName} ${mentor.surname}`,
    'Pronouns': (mentor.profile as any)?.pronouns || 'they/them',
    'Count of Projects Mentored': allMentorship.flatMap(m => m.projects).length,
    'Students Mentored': allMentoredStudents.map(s => s.givenName).join(', '),
    'Count of Students Mentored': allMentoredStudents.length,
    'Mentorship Dates': allMentorship
      .map(m => `${m.startsAtDateString}-${m.endsAtDateString}`)
      .join(', '),
    ...(surveyResponsesFreeResponse.length < 10 ? {} : {
      'What Students Had to Say': `\n` + surveyResponsesFreeResponse,
    }),
  };

  const prompt = GPT_PROMPT + `\n\n` + Object.entries(mentorInformation)
    .map(([k, v]) => `${k}: ${v}`)
    .join(`\n`);

  DEBUG(prompt);
  const completion = await openAi.chat.completions.create({
    messages: [
      { role: 'system', content: GPT_SYSTEM },
      { role: 'user', content: prompt },
    ],
    model: 'gpt-4',
  });
  const result = completion.choices[0].message.content;
  DEBUG(result);

  recommendations.push({
    mentor: `${mentor.givenName} ${mentor.surname}`,
    linkedIn: (mentor.profile as any)?.linkedIn || '',
    ...mentorInformation,
    prompt,
    result,
  });
}

const csv = stringify(recommendations, { header: true });
const slack = getSlackClientForEvent(event);

await slack.files.upload({
  channels: args.channel,
  initial_comment: `Mentor recommendations for ${event.name}`,
  content: csv,
  filename: `recommendations-${event.id}.csv`,
  filetype: 'text/csv',
});
}