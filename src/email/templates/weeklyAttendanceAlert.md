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

## 📝 Mentors Behind on Reflections

{{#if mentorReflectionIssues}}
{{#each mentorReflectionIssues}}
**{{ mentorName }}** ({{ mentorEmail }})
- **Status:** {{ missedReflections }} reflections behind (expected: {{ expectedReflections }})
- **Project:** {{ projectName }}

{{/each}}
{{else}}
_All mentors are up to date on reflections._ ✅
{{/if}}

---

## Summary

- **Total flagged students:** {{ lowAttendanceStudents.length }}
- **Total mentors behind:** {{ mentorReflectionIssues.length }}

_This is an automated report sent every Monday. To adjust the attendance threshold or frequency, contact the engineering team._

Best,  
CodeDay Labs Attendance System
