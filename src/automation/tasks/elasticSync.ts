import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import Container from 'typedi';
import config from '../../config';
import { projectToElasticEntry, ElasticEntrySchema, ElasticEntry } from '../../search';
import { makeDebug } from "../../utils";

const DEBUG = makeDebug('automation:tasks:elasticSync');

export const JOBSPEC = '* * * * *';

export default async function syncElastic(): Promise<void> {
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

  DEBUG(`Synchronized ${dataset.length} entires with elastic (${datasetAvailable.length} available).`);

  if (body.length > 0) {
    const { body: resp } = await elastic.bulk({ refresh: true, body });

    if (resp.errors) {
      resp.items
        // FIXME: hack to remove massive amounts of 404 log spam 
        .filter((action: Record<string, Record<string, unknown>>) => action[Object.keys(action)[0]].error && action[Object.keys(action)[0]].status !== 404 )
        .forEach(DEBUG);
    }
  }
}
