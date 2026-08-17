import 'reflect-metadata';
import assert from 'assert';
import { AttendanceTrackingMode } from '@prisma/client';
import { isAttendanceTracked, resolveAttendanceTracking } from '../src/utils/attendanceTracking';

function run(): void {
  // Project setting takes precedence over the event default.
  assert.strictEqual(
    resolveAttendanceTracking({
      attendanceTracking: AttendanceTrackingMode.NOT_TRACKED,
      event: { defaultAttendanceTracking: AttendanceTrackingMode.SLACK_HUDDLE },
    }),
    AttendanceTrackingMode.NOT_TRACKED,
  );

  // Unset project falls back to the event default.
  assert.strictEqual(
    resolveAttendanceTracking({
      attendanceTracking: null,
      event: { defaultAttendanceTracking: AttendanceTrackingMode.NOT_TRACKED },
    }),
    AttendanceTrackingMode.NOT_TRACKED,
  );

  // A project may opt back in even when its event opts out by default.
  assert.strictEqual(
    resolveAttendanceTracking({
      attendanceTracking: AttendanceTrackingMode.SLACK_HUDDLE,
      event: { defaultAttendanceTracking: AttendanceTrackingMode.NOT_TRACKED },
    }),
    AttendanceTrackingMode.SLACK_HUDDLE,
  );

  // With neither set, tracking defaults on.
  assert.strictEqual(
    resolveAttendanceTracking({ attendanceTracking: null }),
    AttendanceTrackingMode.SLACK_HUDDLE,
  );
  assert.strictEqual(
    resolveAttendanceTracking({ attendanceTracking: null, event: null }),
    AttendanceTrackingMode.SLACK_HUDDLE,
  );

  // isAttendanceTracked mirrors the resolved mode.
  assert.strictEqual(isAttendanceTracked({ attendanceTracking: null }), true);
  assert.strictEqual(
    isAttendanceTracked({ attendanceTracking: AttendanceTrackingMode.NOT_TRACKED }),
    false,
  );
  assert.strictEqual(
    isAttendanceTracked({
      attendanceTracking: null,
      event: { defaultAttendanceTracking: AttendanceTrackingMode.NOT_TRACKED },
    }),
    false,
  );

  // eslint-disable-next-line no-console
  console.log('attendanceTracking tests passed');
}

run();
