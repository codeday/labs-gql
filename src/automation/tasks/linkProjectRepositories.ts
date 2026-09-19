import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import { makeDebug } from '../../utils';
import { parseGithubRepoUrl } from '../../github';

const DEBUG = makeDebug('automation:tasks:linkProjectRepositories');

export const JOBSPEC = '*/3 * * * *';

export default async function linkProjectRepositories(): Promise<void> {
  const prisma = Container.get(PrismaClient);

  const projects = await prisma.project.findMany({
    where: { repositoryId: null, issueUrl: { not: null, notIn: [''] } },
    select: { id: true, issueUrl: true },
  });

  DEBUG(`Found ${projects.length} project(s) with an issue link but no linked repository.`);

  for (const project of projects) {
    const ref = parseGithubRepoUrl(project.issueUrl!);
    if (!ref) {
      DEBUG(`Skipping project ${project.id}: issue URL "${project.issueUrl}" is not a recognizable GitHub URL.`);
      // eslint-disable-next-line no-continue
      continue;
    }

    const repoUrl = `https://github.com/${ref.owner}/${ref.repo}`;

    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await prisma.repository.findFirst({
        where: { url: { equals: repoUrl, mode: 'insensitive' } },
      });
      // eslint-disable-next-line no-await-in-loop
      const repository = existing ?? await prisma.repository.create({
        data: { name: `${ref.owner}/${ref.repo}`, url: repoUrl },
      });

      // eslint-disable-next-line no-await-in-loop
      await prisma.project.update({
        where: { id: project.id },
        data: { repository: { connect: { id: repository.id } } },
      });
      DEBUG(`Linked project ${project.id} to ${existing ? 'existing' : 'new'} repository ${repository.id} (${repoUrl}).`);
    } catch (ex) {
      DEBUG(`Failed to link project ${project.id} to a repository:`, ex);
    }
  }
}
