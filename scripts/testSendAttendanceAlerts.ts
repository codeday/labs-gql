import 'reflect-metadata';
import assert from 'assert';
import { buildWeeklyAttendanceAlertMessage } from '../src/automation/tasks/sendAttendanceAlerts';

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
    2,
  );

  assert.ok(message.includes('Weekly Attendance Alert for CodeDay Labs'));
  assert.ok(message.includes('Students with Low Attendance (<75%)'));
  assert.ok(message.includes('Notify: <@U_STUDENT> <@U_MENTOR>'));
  assert.ok(message.includes('2 project(s) are not tracked'));

  const noUntracked = buildWeeklyAttendanceAlertMessage('CodeDay Labs', [], 0);
  assert.ok(!noUntracked.includes('not tracked'));

  // eslint-disable-next-line no-console
  console.log('sendAttendanceAlerts tests passed');
}

run();
