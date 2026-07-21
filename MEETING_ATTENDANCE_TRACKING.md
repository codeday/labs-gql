# Meeting Attendance Tracking System

This document describes the meeting attendance tracking system implemented in the Labs GraphQL API.

## Overview

The system provides a **two-pronged approach** to tracking student meeting attendance:

1. **Immediate (Backup):** Capture attendance via mentor reflections/surveys
2. **Future (Primary):** Automatically track attendance from Slack meetings (prepared for future implementation)

## Architecture

### Database Schema

**New Enum: `AttendanceSource`**
- `SLACK_HUDDLE` - Direct tracking from Slack huddle API (future)
- `MESSAGE_ACTIVITY` - Inferred from message activity during meeting time (future)
- `MENTOR_REPORT` - From mentor reflection surveys (active)
- `MANUAL` - Manually entered by admin

**Extended Models:**

**`Meeting`**
- `projectId` - Links meetings to specific projects
- `slackHuddleId` - Slack huddle identifier for automatic tracking
- `scheduledStartAt` - Scheduled meeting start time
- `scheduledEndAt` - Scheduled meeting end time

**`MeetingAttendance`**
- `source` - Tracks where attendance data came from (AttendanceSource)
- `confidence` - Quality score (0.0-1.0) for inferred data
- `metadata` - Additional context (e.g., reflection ID, message count)

**`Project`**
- `meetings` - One-to-many relation to meetings

### GraphQL API

**Types:**
- `Meeting` - Represents a scheduled meeting
- `MeetingAttendance` - Attendance record for a student at a meeting
- `MeetingResponse` - Student's agenda/notes for a meeting
- `StudentAttendanceStat` - Attendance statistics for a student
- `MentorReflectionStat` - Reflection completion statistics for a mentor
- `FlaggedStudent` - Students needing attention

**Queries:**
- `meetings(eventId, projectId)` - List meetings
- `meeting(id)` - Get single meeting
- `meetingAttendance(meetingId)` - Get attendance for a meeting
- `statStudentAttendance(eventId, projectId, minAttendance)` - Get attendance stats
- `statMentorReflectionCompletion(eventId)` - Track mentor reflection submissions
- `flaggedStudents(eventId, minAttendance)` - Get students needing attention

**Mutations:**
- `createMeeting(data)` - Create new meeting
- `recordMeetingAttendance(data)` - Record/update attendance (upsert logic)

### Automation Tasks

**`processMentorReflections`** (runs every Monday at 6 AM)
- Processes mentor reflection survey responses
- Extracts attendance data from response JSON
- Automatically creates Meeting records for the week if needed
- Records MeetingAttendance with source=MENTOR_REPORT
- Supports multiple response formats:
  - `response.meetingHeld` - whether meeting occurred
  - `response.studentAttendance` - array of attending student IDs
  - `response.studentsPresent` - alternative format

**`sendAttendanceAlerts`** (runs every Monday at 9 AM)
- Checks all active events for attendance issues
- Identifies students with <75% attendance (minimum 2 meetings)
- Identifies mentors behind on reflections
- Sends Slack alerts to the `#stats` channel with summary
- Email template available for weekly reports

## Usage

### For Admins: Adding Attendance Question to Mentor Surveys

To enable attendance tracking via mentor reflections, add this question to your mentor reflection survey:

```json
{
  "type": "object",
  "properties": {
    "meetingHeld": {
      "type": "boolean",
      "title": "Did you hold a meeting with your student(s) this week?"
    },
    "studentAttendance": {
      "type": "array",
      "title": "Which students attended your meeting?",
      "items": {
        "type": "string",
        "enum": ["student-id-1", "student-id-2", "student-id-3"]
      },
      "uniqueItems": true
    }
  }
}
```

The automation task will automatically process responses and create attendance records.

### For Developers: Querying Attendance Data

**Get attendance stats for an event:**
```graphql
query {
  statStudentAttendance(eventId: "event-id") {
    student { givenName surname email }
    project { description }
    meetingsTotal
    meetingsAttended
    attendancePercentage
    isFlagged
    dataSources
    lastAttendedAt
  }
}
```

**Get flagged students:**
```graphql
query {
  flaggedStudents(eventId: "event-id", minAttendance: 0.75) {
    student { givenName surname }
    mentor { givenName surname }
    reason
    attendancePercentage
    missedMeetings
  }
}
```

**Record manual attendance:**
```graphql
mutation {
  recordMeetingAttendance(data: {
    meetingId: "meeting-id"
    studentId: "student-id"
    attended: true
    source: MANUAL
  }) {
    id attended source
  }
}
```

## Future Enhancements (Phase 5+)

### Slack Message Activity Tracking
- Infer attendance from message activity during meeting times
- Source: `MESSAGE_ACTIVITY`, Confidence: 0.7

### Slack Huddle API Integration
- Direct tracking from Slack huddle events
- Real-time attendance capture
- Source: `SLACK_HUDDLE`, Confidence: 1.0

### Hybrid Attendance Resolution
- Merge attendance from multiple sources
- Priority system: SLACK_HUDDLE > MENTOR_REPORT > MESSAGE_ACTIVITY > MANUAL
- Flag conflicts for review

## Migration

To apply the database changes:

```bash
# Run the migration
npx prisma migrate deploy

# Or for development
npx prisma migrate dev
```

## Testing

1. Create a test meeting:
```graphql
mutation {
  createMeeting(data: {
    eventId: "test-event"
    projectId: "test-project"
    visibleAt: "2025-01-01T00:00:00Z"
    dueAt: "2025-01-08T00:00:00Z"
    scheduledStartAt: "2025-01-03T14:00:00Z"
    scheduledEndAt: "2025-01-03T15:00:00Z"
  }) { id }
}
```

2. Record attendance
3. Check stats with `statStudentAttendance`
4. Verify alert in Slack mentor channel (Mondays at 9 AM)

## Support

For questions or issues, contact the engineering team or open an issue in the repository.
