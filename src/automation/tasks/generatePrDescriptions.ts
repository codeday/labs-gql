import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import OpenAIApi from 'openai';
import { makeDebug } from '../../utils';
import { fetchPullRequest, parseGithubPullRequestUrl, GithubPullRequest } from '../../github';
import { requestSentence } from '../../openai';

const DEBUG = makeDebug('automation:tasks:generatePrDescriptions');

export const JOBSPEC = '*/10 * * * *';

// A small, fast model is plenty for summarizing a PR we've already fetched — no
// research or reasoning is needed here, just condensing text we already have.
const MODEL = 'openai/gpt-5-mini';

const SYSTEM_PROMPT = `
You are an assistant working for an education non-profit called CodeDay.

At CodeDay, we match college students with mentors to help them make real-world
contributions to open-source software projects. Students submit a pull request
to the project's GitHub repository as their contribution.

Given a pull request's title, description, and changed-file stats, write a single,
plain-language sentence summarizing what the contribution does. Write it for a
non-technical but sophisticated reader (e.g. an HR manager), avoid jargon, do not
mention the student or CodeDay, and do not include a trailing period-separated list
of files.

ALWAYS use past tense to describe what the PR did.
`;

// A generous ceiling on the PR body we forward to the model. Truncating by word
// count (not character count) avoids ending mid-word and keeps the request small
// regardless of how long a PR description is.
const MAX_BODY_WORDS = 1000;

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function buildPrompt(pr: GithubPullRequest): string {
  return [
    `Title: ${pr.title}`,
    pr.body ? `Description:\n${truncateWords(pr.body, MAX_BODY_WORDS)}` : undefined,
    `Stats: ${pr.changed_files} file(s) changed, +${pr.additions}/-${pr.deletions} lines.`,
  ].filter(Boolean).join('\n\n');
}

function summarizePullRequest(openRouter: OpenAIApi, pr: GithubPullRequest): Promise<string | null> {
  return requestSentence(openRouter, {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(pr) },
    ],
  });
}

export default async function generatePrDescriptions(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const openRouter = Container.get<OpenAIApi>('openRouterAi');

  const projects = await prisma.project.findMany({
    where: {
      prUrl: { not: null, notIn: [''] },
      prDescriptionFetchedAt: null,
      AND: [
        { prUrl: { contains: 'github.com' } },
        { prUrl: { contains: '/pull/' } },
      ],
    },
    select: { id: true, prUrl: true },
    take: 5,
  });

  DEBUG(`Found ${projects.length} project(s) with a PR that hasn't been summarized yet.`);

  for (const project of projects) {
    const ref = parseGithubPullRequestUrl(project.prUrl!);
    if (!ref) {
      DEBUG(`Skipping project ${project.id}: PR URL "${project.prUrl}" is not a recognizable GitHub pull request URL.`);
      // A malformed URL will never become parseable, so mark it as attempted to avoid
      // retrying it forever.
      // eslint-disable-next-line no-await-in-loop
      await prisma.project.update({ where: { id: project.id }, data: { prDescriptionFetchedAt: new Date() } });
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const pr = await fetchPullRequest(ref.owner, ref.repo, ref.number);
      // eslint-disable-next-line no-await-in-loop
      const description = await summarizePullRequest(openRouter, pr);
      DEBUG(`${project.prUrl} -> ${description ?? '(no usable summary)'}`);

      // Mark it as attempted even if the AI returned nothing usable, so we don't keep
      // re-running (and re-billing for) a PR that will never summarize successfully.
      // eslint-disable-next-line no-await-in-loop
      await prisma.project.update({
        where: { id: project.id },
        data: {
          prDescriptionFetchedAt: new Date(),
          ...(description ? { prShortDescription: description, prFetchedAt: new Date() } : {}),
        },
      });
      if (description) DEBUG(`Set prShortDescription for project ${project.id}.`);
    } catch (ex) {
      // Leave prDescriptionFetchedAt unset on a genuine error (e.g. GitHub/OpenAI outage), so it's retried next run.
      DEBUG(`Failed to summarize PR for project ${project.id}:`, ex);
    }

    // Avoid hammering the GitHub/OpenAI APIs.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
  }
}
