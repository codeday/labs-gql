import { metricGauge } from '../generators';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';

export default async function activeEvents() {
    const prisma = Container.get(PrismaClient);
    const events = await prisma.event.findMany({ where: { isActive: true } });
    return metricGauge('events_active', 'active events', events.map((event) => ({ labels: { id: event.id, name: event.name }, value: event.isActive ? 1 : 0 })));
}