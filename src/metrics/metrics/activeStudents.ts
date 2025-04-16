import { metricGauge } from '../generators';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';

export default async function studentsMetric() {
    const prisma = Container.get(PrismaClient);
    const students = await prisma.student.groupBy({ by: ['eventId', 'status', 'partnerCode', 'minHours', 'weeks', 'timezone'], _count: { _all: true }, where: { event: { isActive: true } } });
    return metricGauge('active_students', 'students registered in active sessions, with more details',
        students.map((student) => ({
            labels: {
                eventId: student.eventId,
                status: student.status,
                partnerCode: student.partnerCode || 'none',
                minHours: student.minHours.toString(),
                weeks: student.weeks.toString(),
                timezone: student.timezone || 'unknown',
            },
            value: student._count._all,
        }))
    );
}