import { PrismaClient, Track, ProjectStatus } from '@prisma/client';

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}

async function main(): Promise<void> {
    const eventId = 'event-test-2025';

    const event = await prisma.event.upsert({
        where: { id: eventId },
        update: {
            name: 'Dummy Event',
            title: 'Dependency Update Test Event',
            emailSignature: '— CodeDay Labs',
            studentApplicationsEndAt: daysFromNow(14),
            mentorApplicationsEndAt: daysFromNow(14),
            matchingDueAt: daysFromNow(21),
            startsAt: daysFromNow(30),
            projectWorkStartsAt: daysFromNow(31),
        },
        create: {
            id: eventId,
            name: 'Dummy Event',
            title: 'Dependency Update Test Event',
            emailSignature: '— CodeDay Labs',
            studentApplicationsStartAt: new Date(),
            mentorApplicationsStartAt: new Date(),
            studentApplicationsEndAt: daysFromNow(14),
            mentorApplicationsEndAt: daysFromNow(14),
            matchingStartsAt: null,
            matchingDueAt: daysFromNow(21),
            matchingEndsAt: null,
            startsAt: daysFromNow(30),
            projectWorkStartsAt: daysFromNow(31),
            studentApplicationSchema: {},
            studentApplicationUi: {},
            studentApplicationPostprocess: {},
            mentorApplicationSchema: {},
            mentorApplicationUi: {},
            mentorApplicationPostprocess: {},
            hasBeginner: true,
            hasIntermediate: true,
            hasAdvanced: true,
            certificationStatements: ['Participants agree to CodeDay Labs testing.'],
            defaultWeeks: 4,
            isActive: true,
            matchPreferenceSubmissionOpen: true,
        },
    });

    const mentorA = await prisma.mentor.upsert({
        where: {
            email_eventId: { email: 'mentor.alice@example.com', eventId: event.id },
        },
        update: {
            givenName: 'Alice',
            surname: 'Mentor',
            username: 'mentor.alice',
            profile: { bio: 'Senior engineer testing dependencies.' },
        },
        create: {
            givenName: 'Alice',
            surname: 'Mentor',
            username: 'mentor.alice',
            email: 'mentor.alice@example.com',
            profile: { bio: 'Senior engineer testing dependencies.' },
            timezone: 'UTC',
            eventId: event.id,
        },
    });

    const mentorB = await prisma.mentor.upsert({
        where: {
            email_eventId: { email: 'mentor.bob@example.com', eventId: event.id },
        },
        update: {
            givenName: 'Bob',
            surname: 'Mentor',
            username: 'mentor.bob',
            profile: { bio: 'Backend mentor for testing.' },
        },
        create: {
            givenName: 'Bob',
            surname: 'Mentor',
            username: 'mentor.bob',
            email: 'mentor.bob@example.com',
            profile: { bio: 'Backend mentor for testing.' },
            timezone: 'UTC',
            eventId: event.id,
        },
    });

    const studentA = await prisma.student.upsert({
        where: {
            email_eventId: { email: 'student.ava@example.com', eventId: event.id },
        },
        update: {
            givenName: 'Ava',
            surname: 'Student',
            username: 'student.ava',
            profile: { interests: ['graphql', 'ts'] },
        },
        create: {
            givenName: 'Ava',
            surname: 'Student',
            username: 'student.ava',
            email: 'student.ava@example.com',
            profile: { interests: ['graphql', 'ts'] },
            track: Track.BEGINNER,
            minHours: 10,
            eventId: event.id,
        },
    });

    const studentB = await prisma.student.upsert({
        where: {
            email_eventId: { email: 'student.ben@example.com', eventId: event.id },
        },
        update: {
            givenName: 'Ben',
            surname: 'Student',
            username: 'student.ben',
            profile: { interests: ['elasticsearch', 'node'] },
        },
        create: {
            givenName: 'Ben',
            surname: 'Student',
            username: 'student.ben',
            email: 'student.ben@example.com',
            profile: { interests: ['elasticsearch', 'node'] },
            track: Track.INTERMEDIATE,
            minHours: 12,
            eventId: event.id,
        },
    });

    const project = await prisma.project.upsert({
        where: { id: 'project-test-2025' },
        update: {
            description: 'Test project for dependency validation.',
            deliverables: 'Working prototype and docs.',
            status: ProjectStatus.ACCEPTED,
        },
        create: {
            id: 'project-test-2025',
            description: 'Test project for dependency validation.',
            deliverables: 'Working prototype and docs.',
            track: Track.INTERMEDIATE,
            maxStudents: 3,
            status: ProjectStatus.ACCEPTED,
            eventId: event.id,
            mentors: { connect: [{ id: mentorA.id }, { id: mentorB.id }] },
            students: { connect: [{ id: studentA.id }, { id: studentB.id }] },
        },
    });

    console.log('Seed complete');
    console.table([
        { entity: 'Event', id: event.id },
        { entity: 'Mentor', id: mentorA.id },
        { entity: 'Mentor', id: mentorB.id },
        { entity: 'Student', id: studentA.id },
        { entity: 'Student', id: studentB.id },
        { entity: 'Project', id: project.id },
    ]);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
