import { metricGauge, MetricLabels } from '../generators';
import config from '../../config';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';
import { arrayFill, average } from '../../utils';

export default async function activeStandups() {
    const prisma = Container.get(PrismaClient);
    const projects = await prisma.project.findMany({
        where: { event: { isActive: true } },
        include: {
            event: { select: { id: true } },
            mentors: { select: { id: true, givenName: true, surname: true } },
            students: { select: { id: true, givenName: true, surname: true } },
            standupThreads: {
                select: {
                    id: true,
                    createdAt: true,
                    results: { select: { rating: true, student: { select: { id: true } } } }
                },
                orderBy: { createdAt: 'desc' },
                take: 3,
            },
        }
    });

    const projectLastStandup: MetricLabels[] = [];
    const projectLastThreeStandups: MetricLabels[] = [];
    const studentLastStandup: MetricLabels[] = [];
    const studentLastThreeStandups: MetricLabels[] = [];

    for (const project of projects) {
        const projectName = project.mentors.map(mentor => `${mentor.givenName} ${mentor.surname}`).join('/');
        const projectStandupScores = project.standupThreads.map(
            standup => [
                ...standup.results.map(result => result.rating || 0),
                ...arrayFill(project.students.length - standup.results.length, 0)
            ]
        );

        if (projectStandupScores.length == 0) continue;

        projectLastStandup.push({
            labels: { project: projectName, event: project?.event?.id || 'none' },
            value: average(...projectStandupScores[0])
        });

        projectLastThreeStandups.push({
            labels: { project: projectName, event: project?.event?.id || 'none' },
            value: average(...projectStandupScores.flat()),
        });

        for (const student of project.students) {
            const studentName = `${student.givenName} ${student.surname}`;
            const studentStandupScores = project.standupThreads.map(s => s.results.find(r => r.student.id === student.id)?.rating || 0);
            studentLastStandup.push({
                labels: { project: projectName, event: project?.event?.id || 'none', student: studentName },
                value: studentStandupScores[0]
            });

            studentLastThreeStandups.push({
                labels: { project: projectName, event: project?.event?.id || 'none', student: studentName },
                value: average(...studentStandupScores)
            });
        }
    }

    return [
        metricGauge('active_projects_last_standup', 'last standup score per project (only active events)', projectLastStandup),
        metricGauge('active_projects_last_three_standups', 'last three standup scores per project (only active events)', projectLastThreeStandups),
        metricGauge('active_students_last_standup', 'last standup score per student (only active events)', studentLastStandup),
        metricGauge('active_students_last_three_standups', 'last three standup scores per student (only active events)', studentLastThreeStandups),
    ].join('\n');
}