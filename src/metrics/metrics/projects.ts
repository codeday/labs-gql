import { metricGauge } from '../generators';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';

export default async function projectsMetric() {
    const prisma = Container.get(PrismaClient);
    const projects = await prisma.project.groupBy({ by: ['eventId', 'status'], _count: { _all: true } });
    return metricGauge('projects', 'projects registered',
        projects.map((project) => ({
            labels: {
                eventId: project.eventId || 'none',
                status: project.status.toString(),
            },
            value: project._count._all,
        }))
    );
}