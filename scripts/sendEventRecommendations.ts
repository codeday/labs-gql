import fetch from 'node-fetch';
import { DateTime } from 'luxon';
import { sign } from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import config from '../src/config';

const mailer = nodemailer.createTransport(config.email);

const now = DateTime.now().toISO();
const end = DateTime.now().plus({ months: 4 }).toISO();

const query = `
query {
  calendar {
    events(calendars:["labs"], after:"${now}", before:"${end}") {
      calendarId
      id
      title
      metadata
    }
  }
  labs {
    tags {
      id
      studentDisplayName
    }
    students {
      givenName
      status
      email
      tags {
        id
      }
      projects {
        tags {
          id
        }
      }
    }
  }
}`;

interface Event {
  calendarId: string
  id: string
  title: string
  metadata: Record<string, string>
}

interface Tag {
  id: string
  studentDisplayName: string
}

interface Student {
  givenName: string
  email: string
  status: string
  tags: { id: string }[]
  projects: { tags: { id: string }[] }[]
}

// eslint-disable-next-line sonarjs/cognitive-complexity
(async () => {
  const token = sign({ typ: 'a' }, config.auth.secret, { audience: config.auth.audience, expiresIn: '5m' });
  const resp = await fetch('https://graph.codeday.org/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Labs-Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  const { data: { labs, calendar } } = await resp.json();
  if (!labs?.students || !labs?.tags || !calendar?.events) throw Error(`Missing information from GraphQL response.`);

  const tagNames: Record<string, string> = (<Tag[]>labs.tags)
    .reduce((accum, t) => ({ [t.id]: t.studentDisplayName, ...accum }), {});

  const filterEventsForTags = (tags: string[]) => (<Event[]>calendar.events).filter((e) => {
    if (!e.metadata?.tags) return false;
    if (e.title.startsWith('Career Talk:')) return false;
    const eTags: string[] = e.metadata.tags.trim().split(',').map((t) => t.trim());
    return eTags.reduce((accum: boolean, tag: string): boolean => accum || tags.includes(tag), false);
  });

  const career = (<Event[]>calendar.events)
    .filter((e) => e.title.startsWith('Career Talk: '))
    .map((e) => `<li><b><a href="https://www.codeday.org/e/${e.calendarId}/${e.id}">${e.title}</a></b></li>`)
    .join(`\n`);

  const studentEvents = (<Student[]>labs.students)
    .map(({ tags, projects, ...rest }) => {
      const interestTagIds = tags.map((t) => t.id);
      const projectTagIds = projects
        .map((project) => project.tags)
        .flat()
        .map((t) => t.id)
        .filter((t) => !interestTagIds.includes(t));
      const matchingEvents = filterEventsForTags([...interestTagIds, ...projectTagIds])
        .map((e) => {
          const eTags = e.metadata.tags.trim().split(',').map((t) => t.trim());
          const interestMatches = eTags.filter((t) => interestTagIds.includes(t));
          const projectMatches = eTags.filter((t) => projectTagIds.includes(t));
          return {
            ...e,
            interestMatches,
            projectMatches,
          };
        });

      return {
        matchingEvents,
        ...rest,
      };
    });

  const emails = studentEvents.map((s) => {
    const eventsList = s.matchingEvents
      .map(({ interestMatches, projectMatches, ...rest }) => {
        const because: string[] = [];
        if (interestMatches.length > 0) {
          because.push(
            `you were interested in ${interestMatches.map((tag) => tagNames[tag])[0]}`,
          );
        }
        if (projectMatches.length > 0) {
          because.push(
            `your project is related to ${projectMatches.map((tag) => tagNames[tag])[0]}`,
          );
        }
        return {
          because: because.join(' and '),
          ...rest,
        };
      })
      .map(({
        because, calendarId, id, title,
      }): string => (
        `<li>
          <b><a href="https://www.codeday.org/e/${calendarId}/${id}">${title}</a></b><br />(because ${because})<br />
        </li>`
      ));

    if (eventsList.length === 0) return s;

    const explain = s.status === 'ACCEPTED'
      ? `In addition to your project-work at Labs, we'd like to recommend you attend the following tech talks:`
      : `Athough ${
        s.status === 'REJECTED' ? 'we were not able to offer you acceptance' : 'you were not able to participate'
      } in CodeDay Labs this summer, we'd like to invite you to the following tech talks we're hosting:`;

    return {
      ...s,
      message: `Hi ${s.givenName},<br /><br />${explain}<br /><br />`
          + `<ul>${eventsList.join(`\n`)}</ul><br /><br />`
          + `And if you're looking to start a career:<br /><br /><ul>${career}</ul><br /><br />`
          + `We hope you'll find some of these talks helpful!<br />`
          + `- The CodeDay Labs team`,
    };
  });
  for (const email of emails) {
    if (!('message' in email)) return;
    // eslint-disable-next-line no-await-in-loop
    await mailer.sendMail({
      to: `"${email.givenName}" <${email.email}>`,
      from: '"CodeDay Labs" <labs@codeday.org>',
      subject: email.status === 'ACCEPTED' ? 'Your Talk Recommendations' : 'Tech talks from CodeDay Labs',
      html: email.message,
    });
    // eslint-disable-next-line no-console
    console.log(email.email);
  }
})();
