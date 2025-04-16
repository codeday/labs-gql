import { metricGauge } from '../generators';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';

export default async function mentorsMetric() {
    const prisma = Container.get(PrismaClient);
    const mentors = await prisma.mentor.groupBy({ by: ['eventId', 'status', 'maxWeeks', 'timezone'], _count: { _all: true } });
    return metricGauge('mentors', 'mentors registered',
        mentors.map((mentor) => ({
            labels: {
                eventId: mentor.eventId,
                status: mentor.status,
                timezone: mentor.timezone || 'unknown',
            },
            value: mentor._count._all,
        }))
    );
}