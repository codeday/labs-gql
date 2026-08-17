---
to: "akif@codeday.org"
subject: "Weekly Attendance Report for {{ event.name }}"
---

# Weekly Attendance Report

**Event:** {{ event.name }}  
**Week of:** {{ prettyDate weekStart }}

---

## 🚨 Students with Low Attendance (<75%)

{{#if lowAttendanceStudents}}
{{#each lowAttendanceStudents}}
**{{ studentName }}** ({{ studentEmail }})
- **Attendance:** {{ attendancePercentage }}% ({{ meetingsAttended }}/{{ meetingsTotal }} meetings)
- **Project:** {{ projectName }}
- **Mentor:** {{ mentorName }}
{{#if lastAttendedAt}}- **Last Attended:** {{ prettyDate lastAttendedAt }}{{/if}}

{{/each}}
{{else}}
_No students with low attendance this week._ ✅
{{/if}}

---

## Summary

- **Total flagged students:** {{ lowAttendanceStudents.length }}
{{#if untrackedProjectCount}}
- **Projects not tracked via Slack (excluded):** {{ untrackedProjectCount }}
{{/if}}

_Attendance is measured from Slack huddles. Teams which meet elsewhere are excluded from this report._

_This is an automated report sent every Monday. To adjust the attendance threshold or frequency, contact the engineering team._

Best,  
CodeDay Labs Attendance System
