import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import OpenAIApi from 'openai';
import { makeDebug } from '../../utils';
import { requestSentence } from '../../openai';

const DEBUG = makeDebug('automation:tasks:researchRepositoryDescriptions');

// This only ever does work for repositories missing a description, which is rare
// (a handful of new repositories at most per run), so it's fine to check hourly.
export const JOBSPEC = '*/10 * * * *';

// Claude Opus 5 is Anthropic's flagship reasoning model. Since this task only runs
// for repositories that don't have a description yet, it's worth paying for the best
// available model rather than optimizing for cost. `:online` turns on OpenRouter's
// web search grounding, which real research (as opposed to training-data recall)
// requires.
const MODEL = 'anthropic/claude-opus-5:online';

function impactPrompt(name: string, url: string): string {
  return `
Help me hype up the ${name} open source project (${url}). Research its impact and users, and find 3-5 bullet points about why it's amazing and has a huge impact on the world.

The context is that I want to explain to a hiring manager or recruiter why contributing to this project is impressive.

Some examples of things that would be amazing:

Having a large number of users / monthly downloads
Having users that are particularly impressive/high-visibility/high-impact
Being extremely important to some other technical project that is very well-known
Being important to society in some other way
Being extremely difficult to contribute to

You will need to conduct some original research.

Once you are down to a few bullet points, select the bullet which is most likely to impress a hiring manager or recruiter, and write one extremely short sentence summarizing it.

For example, a sentence for p5.js could be "Art made with p5.js hangs in the Met." Or for OpenTimeline.io, you could return "Used in Pixar's rendering pipeline."

DO NOT ask questions or return additional data. ONLY return a sentence comprising 5-10 words.

DO NOT use the project name in the description.
`.trim();
}

function usePrompt(name: string, url: string): string {
  return `
Help me describe how the ${name} open source project (${url}) is actually used in the real world.

The context is that I want to give a hiring manager or recruiter a quick, concrete sense of this project's real-world purpose.

You will need to conduct some original research. Do not mention specific users (although an industry is fine).

For example, a sentence for p5.js could be "Used to teach creative coding." Or for OpenTimelineIO, you could return "Used by movie studios to exchange editorial data."

DO NOT ask questions or return additional data. ONLY return a sentence comprising 5-10 words.
`.trim();
}

function research(openRouter: OpenAIApi, prompt: string): Promise<string | null> {
  return requestSentence(openRouter, {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8000,
    reasoning: { effort: 'high' },
  });
}

export default async function researchRepositoryDescriptions(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const openRouter = Container.get<OpenAIApi>('openRouterAi');

  const repositories = await prisma.repository.findMany({
    where: { descriptionsFetchedAt: null },
    select: {
      id: true, name: true, url: true, useDescription: true, impactDescription: true,
    },
    take: 5,
  });

  DEBUG(`Found ${repositories.length} repositor${repositories.length === 1 ? 'y' : 'ies'} that haven't been researched yet.`);

  for (const repository of repositories) {
    // Set unconditionally (even if the AI returns nothing usable below), so we don't
    // keep re-running (and re-billing for) a repository the AI can't describe.
    const data: { useDescription?: string, impactDescription?: string, descriptionsFetchedAt: Date } = {
      descriptionsFetchedAt: new Date(),
    };

    if (!repository.useDescription) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const useDescription = await research(openRouter, usePrompt(repository.name, repository.url));
        DEBUG(`${repository.url} (use) -> ${useDescription ?? '(no usable answer)'}`);
        if (useDescription) data.useDescription = useDescription;
      } catch (ex) {
        DEBUG(`Failed to research use description for repository ${repository.id}:`, ex);
      }
    }

    if (!repository.impactDescription) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const impactDescription = await research(openRouter, impactPrompt(repository.name, repository.url));
        DEBUG(`${repository.url} (impact) -> ${impactDescription ?? '(no usable answer)'}`);
        if (impactDescription) data.impactDescription = impactDescription;
      } catch (ex) {
        DEBUG(`Failed to research impact description for repository ${repository.id}:`, ex);
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await prisma.repository.update({ where: { id: repository.id }, data });
    DEBUG(`Updated repository ${repository.id} with: ${Object.keys(data).join(', ')}.`);
  }
}
