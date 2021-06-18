import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../config';
import { projectToElasticEntry, ElasticEntrySchema, ElasticEntry } from './ElasticEntry';

export async function syncElastic(): Promise<void> {
  const prisma = Container.get(PrismaClient);
  const elastic = Container.get(Client);

  const allProjects = await prisma.project.findMany({
    include: {
      mentors: true,
      tags: true,
      projectPreferences: true,
    },
  });

  if (!elastic.indices.exists({ index: config.elastic.index })) {
    await elastic.indices.create({
      index: config.elastic.index,
      body: { mappings: { properties: ElasticEntrySchema } },
    });
  }

  const dataset = <ElasticEntry[]>allProjects.map(projectToElasticEntry).filter(Boolean);
  const datasetAvailable = dataset.filter((doc) => doc.available);
  const datasetUnavailable = dataset.filter((doc) => !doc.available);
  const body = [
    ...datasetAvailable.flatMap((doc) => [
      { index: { _index: config.elastic.index, _id: doc.id } },
      doc,
    ]),
    ...datasetUnavailable.map((doc) => (
      { delete: { _index: config.elastic.index, _id: doc.id } }
    )),
  ];

  // eslint-disable-next-line no-console
  console.log(`Synchronized ${dataset.length} entires with elastic (${datasetAvailable.length} available).`);

  const { body: resp } = await elastic.bulk({ refresh: true, body });

  if (resp.errors) {
    resp.items
      .filter((action: Record<string, Record<string, unknown>>) => action[Object.keys(action)[0]].error)
      // eslint-disable-next-line no-console
      .forEach(console.error);
  }
}
