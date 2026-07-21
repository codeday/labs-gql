import 'reflect-metadata';
import assert from 'assert';
import { buildWeeklyAttendanceAlertMessage } from './sendAttendanceAlerts';

function run(): void {
  const message = buildWeeklyAttendanceAlertMessage(
    'CodeDay Labs',
    [
      {
        studentName: 'Student One',
        studentEmail: 'student@example.com',
        studentSlackId: 'U_STUDENT',
        projectName: 'Project Alpha',
        mentorName: 'Mentor One',
        mentorSlackId: 'U_MENTOR',
        attendancePercentage: 0.5,
        meetingsAttended: 1,
        meetingsTotal: 2,
      },
    ],
    [
      {
        mentorName: 'Mentor One',
        mentorEmail: 'mentor@example.com',
        mentorSlackId: 'U_MENTOR',
        projectName: 'Project Alpha',
        missedReflections: 2,
        expectedReflections: 4,
      },
    ]
  );

  assert.ok(message.includes('Weekly Attendance Alert for CodeDay Labs'));
  assert.ok(message.includes('Students with Low Attendance (<75%)'));
  assert.ok(message.includes('Notify: <@U_STUDENT> <@U_MENTOR>'));
  assert.ok(message.includes('Mentors Behind on Reflections'));
  assert.ok(message.includes('Notify: <@U_MENTOR>'));

  // eslint-disable-next-line no-console
  console.log('sendAttendanceAlerts tests passed');
}

run();
