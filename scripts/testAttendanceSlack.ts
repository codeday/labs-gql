/**
 * Manual test script for the attendance Slack integration
 *
 * This script allows you to seed local test data, preview the attendance alert
 * message, and optionally post it to a test Slack channel without affecting
 * real events.
 *
 * Usage:
 *   # Dry run - preview message without posting
 *   npx ts-node scripts/testAttendanceSlack.ts --dry-run
 *
 *   # Seed local DB and preview the real alert message from seeded data
 *   npx ts-node scripts/testAttendanceSlack.ts --seed-test-data --use-real-data --dry-run
 *
 *   # Seed local DB and post to a test channel
 *   npx ts-node scripts/testAttendanceSlack.ts --seed-test-data --use-real-data --channel=test-notifications
 *
 *   # Post fake data to #stats
 *   npx ts-node scripts/testAttendanceSlack.ts --channel=stats
 */

import 'reflect-metadata';
import { PrismaClient, MentorStatus, ProjectStatus, StudentStatus, Track } from '@prisma/client';
import Container from 'typedi';
import { WebClient } from '@slack/web-api';
import { DateTime } from 'luxon';
import { buildWeeklyAttendanceAlertMessage, AttendanceIssue, MentorIssue } from '../src/automation/tasks/sendAttendanceAlerts';
import { getSlackClientForEvent } from '../src/slack';
import { registerDi } from '../src/di';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const useRealData = args.includes('--use-real-data');
const seedTestData = args.includes('--seed-test-data');
const channelArg = args.find((arg) => arg.startsWith('--channel='));
const channelName = channelArg ? channelArg.split('=')[1] : 'attendance-test';

const TEST_EVENT_ID = 'attendance-slack-test-event';
const TEST_EVENT_NAME = 'Attendance Slack Test Event';
const TEST_PROJECT_ID = 'attendance-slack-test-project';
const TEST_MENTOR_ID = 'attendance-slack-test-mentor';
const TEST_STUDENT_ID = 'attendance-slack-test-student';
const TEST_MEETING_ONE_ID = 'attendance-slack-test-meeting-1';
const TEST_MEETING_TWO_ID = 'attendance-slack-test-meeting-2';
const TEST_ATTENDANCE_ONE_ID = 'attendance-slack-test-attendance-1';
const TEST_ATTENDANCE_TWO_ID = 'attendance-slack-test-attendance-2';
const TEST_SLACK_BOT_TOKEN = process.env.TEST_SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN || null;

interface TestEventInfo {
    eventId: string;
    eventName: string;
    hasSlackToken: boolean;
}

const FAKE_STUDENT_ISSUES: AttendanceIssue[] = [
    {
        studentName: 'Alice TestStudent',
        studentEmail: 'alice.teststudent@example.test',
        studentSlackId: null,
        projectName: 'Attendance Slack Test Project',
        mentorName: 'Test Mentor',
        mentorSlackId: null,
        attendancePercentage: 0.5,
        meetingsAttended: 1,
        meetingsTotal: 2,
        lastAttendedAt: new Date(),
    },
];

const FAKE_MENTOR_ISSUES: MentorIssue[] = [
    {
        mentorName: 'Test Mentor',
        mentorEmail: 'test.mentor@example.test',
        mentorSlackId: null,
        projectName: 'Attendance Slack Test Project',
        missedReflections: 2,
        expectedReflections: 4,
    },
];

async function resolveSlackChannelId(slack: WebClient, channelInput: string): Promise<string> {
    const normalizedChannel = channelInput.replace(/^#/, '');

    if (/^[CGD][A-Z0-9]+$/i.test(normalizedChannel)) {
        return normalizedChannel;
    }

    const channelsList = await slack.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
        limit: 100,
    });

    const channel = channelsList.channels?.find((item: any) => item.name === normalizedChannel);

    if (!channel?.id) {
        throw new Error(`Channel #${normalizedChannel} was not found in the test Slack workspace.`);
    }

    return channel.id;
}

async function seedLocalTestData(prisma: PrismaClient): Promise<TestEventInfo> {
    const now = DateTime.now();
    let slackWorkspaceId: string | null = null;

    if (TEST_SLACK_BOT_TOKEN) {
        const slack = new WebClient(TEST_SLACK_BOT_TOKEN);
        const auth = await slack.auth.test();
        slackWorkspaceId = auth.team_id || null;
    }

    await prisma.meetingAttendance.deleteMany({ where: { id: { in: [TEST_ATTENDANCE_ONE_ID, TEST_ATTENDANCE_TWO_ID] } } });
    await prisma.meeting.deleteMany({ where: { id: { in: [TEST_MEETING_ONE_ID, TEST_MEETING_TWO_ID] } } });
    await prisma.project.deleteMany({ where: { id: TEST_PROJECT_ID } });
    await prisma.student.deleteMany({ where: { id: TEST_STUDENT_ID } });
    await prisma.mentor.deleteMany({ where: { id: TEST_MENTOR_ID } });
    await prisma.event.deleteMany({ where: { id: TEST_EVENT_ID } });

    await prisma.event.create({
        data: {
            id: TEST_EVENT_ID,
            name: TEST_EVENT_NAME,
            title: TEST_EVENT_NAME,
            certificationStatements: [],
            studentApplicationsStartAt: now.minus({ days: 60 }).toJSDate(),
            mentorApplicationsStartAt: now.minus({ days: 60 }).toJSDate(),
            studentApplicationsEndAt: now.minus({ days: 45 }).toJSDate(),
            mentorApplicationsEndAt: now.minus({ days: 45 }).toJSDate(),
            startsAt: now.minus({ days: 35 }).toJSDate(),
            projectWorkStartsAt: now.minus({ days: 30 }).toJSDate(),
            studentApplicationSchema: {},
            studentApplicationUi: {},
            studentApplicationPostprocess: {},
            mentorApplicationSchema: {},
            mentorApplicationUi: {},
            mentorApplicationPostprocess: {},
            isActive: true,
            defaultWeeks: 4,
            slackWorkspaceAccessToken: TEST_SLACK_BOT_TOKEN,
            slackWorkspaceId,
            slackMentorChannelId: null,
        },
    });

    await prisma.mentor.create({
        data: {
            id: TEST_MENTOR_ID,
            eventId: TEST_EVENT_ID,
            givenName: 'Test',
            surname: 'Mentor',
            email: 'test.mentor@example.test',
            profile: {},
            status: MentorStatus.ACCEPTED,
            slackId: 'U_TEST_MENTOR',
        },
    });

    await prisma.student.create({
        data: {
            id: TEST_STUDENT_ID,
            eventId: TEST_EVENT_ID,
            givenName: 'Test',
            surname: 'Student',
            email: 'test.student@example.test',
            profile: {},
            track: Track.BEGINNER,
            status: StudentStatus.ACCEPTED,
            minHours: 5,
            slackId: 'U_TEST_STUDENT',
        },
    });

    await prisma.project.create({
        data: {
            id: TEST_PROJECT_ID,
            eventId: TEST_EVENT_ID,
            description: 'Attendance Slack test project',
            deliverables: 'Weekly meeting attendance mock data',
            track: Track.BEGINNER,
            status: ProjectStatus.MATCHED,
            mentors: {
                connect: [{ id: TEST_MENTOR_ID }],
            },
            students: {
                connect: [{ id: TEST_STUDENT_ID }],
            },
        },
    });

    await prisma.meeting.createMany({
        data: [
            {
                id: TEST_MEETING_ONE_ID,
                eventId: TEST_EVENT_ID,
                visibleAt: now.minus({ days: 14 }).toJSDate(),
                dueAt: now.minus({ days: 13 }).toJSDate(),
            },
            {
                id: TEST_MEETING_TWO_ID,
                eventId: TEST_EVENT_ID,
                visibleAt: now.minus({ days: 7 }).toJSDate(),
                dueAt: now.minus({ days: 6 }).toJSDate(),
            },
        ],
    });

    await prisma.meetingAttendance.createMany({
        data: [
            {
                id: TEST_ATTENDANCE_ONE_ID,
                meetingId: TEST_MEETING_ONE_ID,
                studentId: TEST_STUDENT_ID,
                attended: true,
            },
            {
                id: TEST_ATTENDANCE_TWO_ID,
                meetingId: TEST_MEETING_TWO_ID,
                studentId: TEST_STUDENT_ID,
                attended: false,
            },
        ],
    });

    return {
        eventId: TEST_EVENT_ID,
        eventName: TEST_EVENT_NAME,
        hasSlackToken: Boolean(TEST_SLACK_BOT_TOKEN && slackWorkspaceId),
    };
}

async function collectAttendanceIssuesFromEvent(
    prisma: PrismaClient,
    event: { id: string; name: string; startsAt: Date; defaultWeeks: number },
): Promise<{ students: AttendanceIssue[]; mentors: MentorIssue[] }> {
    const projects = await prisma.project.findMany({
        where: {
            eventId: event.id,
            status: 'MATCHED',
        },
        include: {
            students: { where: { status: 'ACCEPTED' } },
            mentors: { where: { status: 'ACCEPTED' } },
        },
    });

    const meetings = await prisma.meeting.findMany({
        where: {
            eventId: event.id,
        },
        include: {
            attendance: true,
        },
    });

    const students: AttendanceIssue[] = [];
    const mentors: MentorIssue[] = [];

    for (const project of projects) {
        const mentor = project.mentors[0];
        if (!mentor) continue;

        for (const student of project.students) {
            const studentAttendance = meetings.flatMap((meeting) =>
                meeting.attendance.filter((attendance) => attendance.studentId === student.id)
            );

            const meetingsTotal = meetings.length;
            const meetingsAttended = studentAttendance.filter((attendance) => attendance.attended).length;
            const attendancePercentage = meetingsTotal > 0 ? meetingsAttended / meetingsTotal : 1;

            if (attendancePercentage < 0.75 && meetingsTotal >= 2) {
                const lastAttended = studentAttendance
                    .filter((attendance) => attendance.attended)
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

                students.push({
                    studentName: `${student.givenName} ${student.surname}`,
                    studentEmail: student.email,
                    studentSlackId: student.slackId || undefined,
                    projectName: project.description?.slice(0, 50) || 'Untitled Project',
                    mentorName: `${mentor.givenName} ${mentor.surname}`,
                    mentorSlackId: mentor.slackId || undefined,
                    attendancePercentage,
                    meetingsAttended,
                    meetingsTotal,
                    lastAttendedAt: lastAttended?.createdAt,
                });
            }
        }

        const mentorReflections = await prisma.surveyResponse.count({
            where: {
                authorMentorId: mentor.id,
                surveyOccurence: {
                    survey: {
                        personType: 'MENTOR',
                        eventId: event.id,
                    },
                },
            },
        });

        const weeksSinceStart = Math.max(
            1,
            Math.floor(DateTime.now().diff(DateTime.fromJSDate(event.startsAt), 'weeks').weeks)
        );
        const expectedReflections = Math.min(weeksSinceStart, event.defaultWeeks);

        if (mentorReflections < expectedReflections * 0.75 && expectedReflections >= 2) {
            mentors.push({
                mentorName: `${mentor.givenName} ${mentor.surname}`,
                mentorEmail: mentor.email,
                mentorSlackId: mentor.slackId || undefined,
                projectName: project.description?.slice(0, 50) || 'Untitled Project',
                missedReflections: expectedReflections - mentorReflections,
                expectedReflections,
            });
        }
    }

    return { students, mentors };
}

async function postTestMessage(
    slack: WebClient | null,
    channelNameToUse: string,
    eventName: string,
    students: AttendanceIssue[],
    mentors: MentorIssue[],
): Promise<void> {
    const message = {
        channel: channelNameToUse,
        text: buildWeeklyAttendanceAlertMessage(eventName, students, mentors),
    };

    if (isDryRun) {
        console.log('\n📋 DRY RUN - Message preview:');
        console.log(JSON.stringify(message, null, 2));
        console.log('\n✅ Dry run complete - no message posted');
        return;
    }

    if (!slack) {
        throw new Error('Slack client is required for live posting.');
    }

    const channelId = await resolveSlackChannelId(slack, channelNameToUse);

    await slack.chat.postMessage({
        ...message,
        channel: channelId,
    });

    console.log(`\n✅ Test message posted to #${channelNameToUse}`);
}

async function main() {
    console.log('🧪 Attendance Slack - Test Script\n');
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Channel: #${channelName}`);
    console.log(`Data: ${useRealData ? 'Real from database' : 'Fake test data'}\n`);

    registerDi();
    const prisma = Container.get(PrismaClient);

    try {
        let seededEventInfo: TestEventInfo | null = null;
        if (seedTestData) {
            console.log('Seeding local attendance test data...');
            seededEventInfo = await seedLocalTestData(prisma);
            console.log(`✅ Seeded event: ${seededEventInfo.eventName} (${seededEventInfo.eventId})`);
            if (!seededEventInfo.hasSlackToken) {
                console.log('⚠️  Seeded DB data, but no test Slack bot token was found. Live posting will still require TEST_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN.');
            }
        }

        let students: AttendanceIssue[];
        let mentors: MentorIssue[];
        let eventName: string;

        if (useRealData) {
            const sourceEvent = seededEventInfo
                ? await prisma.event.findUnique({ where: { id: seededEventInfo.eventId } })
                : await prisma.event.findFirst({
                    where: {
                        isActive: true,
                        slackWorkspaceAccessToken: { not: null },
                        slackWorkspaceId: { not: null },
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    },
                });

            if (!sourceEvent) {
                console.error('❌ No event found to pull attendance data from. Seed data first with --seed-test-data.');
                process.exit(1);
            }

            const issues = await collectAttendanceIssuesFromEvent(prisma, sourceEvent);
            students = issues.students;
            mentors = issues.mentors;
            eventName = sourceEvent.name;

            console.log(`Using event data: ${sourceEvent.name} (${sourceEvent.id})`);
            console.log(`Found ${students.length} flagged students and ${mentors.length} flagged mentors in local DB\n`);

            if (students.length === 0 || mentors.length === 0) {
                console.error('❌ Seeded test data did not produce both student and mentor issues.');
                process.exit(1);
            }
        } else {
            students = FAKE_STUDENT_ISSUES;
            mentors = FAKE_MENTOR_ISSUES;
            eventName = TEST_EVENT_NAME;
        }

        if (isDryRun) {
            await postTestMessage(null, channelName, eventName, students, mentors);
            return;
        }

        const event = seededEventInfo
            ? await prisma.event.findUnique({ where: { id: seededEventInfo.eventId } })
            : await prisma.event.findFirst({
                where: {
                    isActive: true,
                    slackWorkspaceAccessToken: { not: null },
                    slackWorkspaceId: { not: null },
                },
                orderBy: {
                    updatedAt: 'desc',
                },
            });

        if (!event?.slackWorkspaceAccessToken || !event.slackWorkspaceId) {
            console.error('❌ No active event with Slack workspace token found. Seed a test event with TEST_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN.');
            process.exit(1);
        }

        console.log(`Using Slack event: ${event.name} (${event.id})\n`);

        const slack = getSlackClientForEvent(event);

        await postTestMessage(slack, channelName, eventName, students, mentors);
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log('\n✨ Test complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });