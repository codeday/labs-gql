# Slack Huddle Attendance Tracking

Automatic attendance tracking for student meetings using Slack huddles.

## Overview

This system automatically tracks student attendance at meetings by monitoring Slack huddle participation. When a mentor joins a Slack huddle in a project channel, it creates a meeting record. When students join, their attendance is automatically recorded.

### Key Features

- **Zero-configuration**: No setup required by mentors or students
- **Mentor-initiated**: Meeting is created when a mentor joins a huddle
- **Automatic attendance**: Students who join the huddle are marked as present
- **Automatic absences**: Students who don't join are marked as absent when the meeting ends
- **Flexible scheduling**: Meetings can happen any day/time - no pre-scheduling required
- **High confidence**: All records have confidence score of 1.0 (100% accurate)
- **Opt-out aware**: Teams which do not meet on Slack are excluded rather than reported as absent

## How It Works

### 1. Mentor Starts Meeting

```
Mentor Jane joins huddle in #labs-project-channel
  ↓
System creates Meeting record with:
  - slackHuddleId: unique huddle identifier
  - scheduledStartAt: when mentor joined
  - scheduledEndAt: when mentor joined (updated later)
  - projectId: linked to the project
  - source: SLACK_HUDDLE
```

### 2. Students Join

```
Student Sarah joins huddle
  ↓
System creates MeetingAttendance record:
  - attended: true
  - source: SLACK_HUDDLE
  - confidence: 1.0
  - metadata: { huddleId, joinedAt }
```

### 3. Meeting Ends

```
Last person leaves huddle
  ↓
System updates Meeting:
  - scheduledEndAt: time last person left

Daily task runs (2 AM):
  - Finds meetings that ended in last 24 hours
  - Marks students who didn't join as absent
```

## Architecture

### Database Models

**SlackHuddleParticipation** - Tracks every join/leave event
```prisma
model SlackHuddleParticipation {
  id         String    @id
  huddleId   String
  userId     String    // Slack user ID
  joinedAt   DateTime
  leftAt     DateTime?
  studentId  String?
  mentorId   String?
  meetingId  String?
  projectId  String?
}
```

**Meeting** - Extended with Slack huddle tracking
```prisma
model Meeting {
  slackHuddleId    String?   // Links to huddle
  scheduledStartAt DateTime?
  scheduledEndAt   DateTime?
  projectId        String?
}
```

**MeetingAttendance** - Attendance records with source tracking
```prisma
model MeetingAttendance {
  attended   Boolean
  source     AttendanceSource // SLACK_HUDDLE
  confidence Float           // 1.0 for huddle data
  metadata   Json?           // { huddleId, joinedAt }
}
```

**Project / Event** - Opt-out configuration
```prisma
model Project {
  attendanceTracking AttendanceTrackingMode? // null = inherit from event
}

model Event {
  defaultAttendanceTracking AttendanceTrackingMode @default(SLACK_HUDDLE)
}
```

## Opting a Team Out

Not every team meets on Slack. Because this system infers absence from the *lack*
of a huddle join, an untracked team would otherwise appear to have 0% attendance.

Set `attendanceTracking` to `NOT_TRACKED` on the project to exclude it:

```graphql
mutation {
  editProject(
    project: "<project-id>"
    data: { attendanceTracking: NOT_TRACKED }
  ) { id attendanceTracking }
}
```

To opt out an entire cohort, set `defaultAttendanceTracking: NOT_TRACKED` on the
event; individual projects can still opt back in by setting `SLACK_HUDDLE`.

A project with no explicit value inherits the event default, which is
`SLACK_HUDDLE` (tracked) unless changed.

### What opting out changes

| Component | Behaviour when `NOT_TRACKED` |
| --- | --- |
| `huddleHandler` | No meetings or attendance are created for the channel |
| `markAbsentStudents` | Project is skipped, so no student is marked absent |
| `statStudentAttendance` | Returns `trackingMode: NOT_TRACKED` and never sets `isFlagged` |
| `flaggedStudents` | Project's students are never flagged |
| `sendAttendanceAlerts` | Project excluded; count reported as a footnote |

The `trackingMode` field lets the dashboard distinguish "this student missed
meetings" from "we do not measure this team", so 0% is never shown for an
untracked project.

### Components

1. **Webhook Handler** (`src/slack/webhooks.ts`)
   - Receives `user_huddle_changed` events from Slack
   - Validates event type and data
   - Routes to huddle handler

2. **Huddle Event Handler** (`src/slack/events/huddleHandler.ts`)
   - Processes join/leave events
   - Creates meetings when mentors join
   - Records attendance when students join
   - Updates meeting end time when huddle ends

3. **Absent Marker Task** (`src/automation/tasks/markAbsentStudents.ts`)
   - Runs daily at 2 AM
   - Finds meetings that ended in last 24 hours
   - Marks students who didn't attend as absent




## Configuration

### Slack App Setup

1. **Event Subscriptions**:
   - Enable Events: ON
   - Request URL: `https://labs.codeday.org/{WEBHOOK_KEY}/slack`
   - Subscribe to bot events: `user_huddle_changed`

2. **OAuth & Permissions**:
   - Bot Token Scopes:
     - `channels:read` (read channel info)
     - `users:read` (map Slack users to students/mentors)

3. **Reinstall to Workspace** after changing scopes

### Environment Variables

No additional environment variables needed - uses existing `WEBHOOK_KEY`.

## User Experience

### For Mentors

- Start a huddle in the project channel; attendance is tracked automatically
- Nothing to submit or remember
- If the team meets outside Slack, ask for the project to be set to `NOT_TRACKED`

### For Students

- Join the huddle as normal
- Attendance is recorded automatically, with no extra steps

### For Program Managers (Akif)

**Query attendance:**
```graphql
query {
  statStudentAttendance(eventId: "spring-2025") {
    student { givenName surname }
    project { description }
    meetingsTotal
    meetingsAttended
    attendancePercentage
    dataSources
    trackingMode
    lastAttendedAt
    isFlagged
  }
}
```

**Example result:**
```json
{
  "student": { "givenName": "Sarah", "surname": "Johnson" },
  "project": { "description": "React Contribution" },
  "meetingsTotal": 8,
  "meetingsAttended": 8,
  "attendancePercentage": 1.0,
  "dataSources": ["SLACK_HUDDLE"],
  "trackingMode": "SLACK_HUDDLE",
  "lastAttendedAt": "2025-02-15T14:05:00Z",
  "isFlagged": false
}
```

## Edge Cases

### Student Joins Before Mentor

**Scenario:** Students start huddle before mentor arrives

**Behavior:**
- Student participation is logged in `SlackHuddleParticipation`
- No meeting created yet (mentor hasn't joined)
- When mentor joins:
  - Meeting is created
  - All existing participations are linked to meeting
  - Attendance records created for students already in huddle

### Late Arrival

**Scenario:** Student joins 30 minutes late

**Behavior:**
- Still marked as attended
- `joinedAt` timestamp stored in metadata
- Can review actual join time if needed

### Early Departure

**Scenario:** Student leaves before meeting ends

**Behavior:**
- Still marked as attended (they joined)
- `leftAt` timestamp recorded
- Can review participation duration if needed

### Non-Project Members Join

**Scenario:** Someone not in the project joins the huddle

**Behavior:**
- Participation logged but ignored
- No attendance record created
- Doesn't affect project meeting

### Multiple Huddles Same Day

**Scenario:** Mentor runs two huddles in one day

**Behavior:**
- Each huddle creates separate meeting
- Attendance tracked separately for each
- Dashboard shows all meetings

## Deployment

### Database Migration

```bash
# Apply schema changes
yarn prisma migrate deploy

# Generate Prisma client
yarn prisma generate
```

### Deploy Application

```bash
# Build
yarn build

# Deploy (Fly.io)
fly deploy
```

### Configure Slack Webhook

1. Go to https://api.slack.com/apps
2. Select your app
3. Navigate to Event Subscriptions
4. Set Request URL: `https://labs.codeday.org/{WEBHOOK_KEY}/slack`
5. Slack will send verification challenge - server responds automatically
6. Subscribe to `user_huddle_changed` event
7. Save changes

### Verify Setup

1. Have a mentor join a test huddle in a project channel
2. Check server logs for: `Created meeting {id} from mentor joining huddle`
3. Have a student join the huddle
4. Check logs for: `Recorded attendance for student {id} at meeting {id}`
5. Everyone leave the huddle
6. Check logs for: `Huddle {id} ended, updated meeting end time`
7. Wait until next day (2 AM) or manually run the task
8. Check that absent students are marked

## Monitoring

### Logs to Watch

```bash
# Huddle events
DEBUG=slack:events:huddle

# Webhook processing
DEBUG=slack:webhooks

# Absent marking
DEBUG=automation:tasks:markAbsentStudents
```

### Metrics to Track

- **Huddle events received** - Should match number of join/leave actions
- **Meetings created** - Should match number of mentor huddle joins
- **Attendance records** - Should match number of student huddle joins
- **Absences marked** - Runs daily at 2 AM, should process previous day's meetings

## Troubleshooting

### Mentor joins but no meeting created

**Check:**
- Is project status `MATCHED`?
- Does project have `slackChannelId` set?
- Is mentor status `ACCEPTED`?
- Check logs for errors

### Student joins but attendance not recorded

**Check:**
- Did mentor join first? (if not, wait for mentor)
- Is student status `ACCEPTED`?
- Is student's `slackId` set correctly?
- Check logs for errors

### Absent students not marked

**Check:**
- Has the 2 AM task run yet today?
- Is the daily task running? (check logs at 2 AM)
- Did the meeting have a `slackHuddleId`?
- Did the meeting end in the last 24 hours?

## Future Enhancements

1. **Backfill historical huddles** - Process old huddle data before system was deployed
2. **Participation duration** - Calculate how long each student stayed in huddle
3. **Conflict resolution** - Handle disagreements between huddle data and mentor reports
4. **Real-time notifications** - Alert mentors if student is late/absent
5. **Dashboard widgets** - Show live huddle status for active meetings

## Related Documentation

- [MEETING_ATTENDANCE_TRACKING.md](./MEETING_ATTENDANCE_TRACKING.md) - Overall attendance system (Phase 1-4)
- Slack Events API: https://api.slack.com/events-api
- Prisma migrations: https://www.prisma.io/docs/concepts/components/prisma-migrate
