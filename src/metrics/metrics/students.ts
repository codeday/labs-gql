import { metricGauge } from '../generators';
import Container from 'typedi';
import { PrismaClient, StudentStatus } from '@prisma/client';

export default async function studentsMetric() {
    const prisma = Container.get(PrismaClient);
    const students = await prisma.student.groupBy({ by: ['eventId', 'partnerCode'], _count: { _all: true }, where: { status: StudentStatus.ACCEPTED } });
    return metricGauge('students', 'students registered',
        students.map((student) => ({
            labels: {
                eventId: student.eventId,
                partnerCode: student.partnerCode || 'none',
            },
            value: student._count._all,
        }))
    );
}