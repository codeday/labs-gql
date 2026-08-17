import { AttendanceTrackingMode } from '@prisma/client';

export interface AttendanceTrackingConfig {
  attendanceTracking: AttendanceTrackingMode | null;
  event?: { defaultAttendanceTracking: AttendanceTrackingMode } | null;
}

/**
 * Resolves the effective attendance tracking mode for a project, falling back to
 * the event default when the project has no explicit setting.
 */
export function resolveAttendanceTracking(project: AttendanceTrackingConfig): AttendanceTrackingMode {
  return project.attendanceTracking
    ?? project.event?.defaultAttendanceTracking
    ?? AttendanceTrackingMode.SLACK_HUDDLE;
}

/**
 * Whether attendance for a project is derived from Slack huddles. Projects which
 * meet elsewhere have no huddle data, so their absence of records must not be
 * reported as missed meetings.
 */
export function isAttendanceTracked(project: AttendanceTrackingConfig): boolean {
  return resolveAttendanceTracking(project) === AttendanceTrackingMode.SLACK_HUDDLE;
}
