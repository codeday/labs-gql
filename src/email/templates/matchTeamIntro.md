---
to: "{{ join (mapToKey project.students 'email') ',' }}, {{ join (mapToKey project.mentors 'email') ','}}"
cc: "{{ join (mentorManagers project '@codeday.org') ',' }}"
subject: "[Action Required] {{ event.name }} Team Intro: {{{ join (mapToKey project.students 'givenName') ' <> ' }}} <> {{{ join (mapToKey project.mentors 'givenName') ' <> '}}}"
---

{{ join (names project.students) '/' }} (students), and {{ join (names project.mentors) '/'}} (mentors) --

Welcome to CodeDay Labs! We have placed you together in a team, working on this project:

<blockquote>{{ project.description }}</blockquote>

**ACTION REQUIRED -- NEXT STEPS:**

- **Mentors:** Can you please send a When2meet (or other calendar scheduling link) for the first meeting?
- **Students:**
  - (1) introduce yourself (e.g. where you go to school, career goals, or anything else you want to share with your mentor)
  - (2) [log into your dashboard](https://labs.codeday.org/dash) to view any outstanding assignments
  - (3) once your mentor replies to this email with a When2Meet, make sure to fill it out

**STUDENTS AND MENTORS, YOUR NEXT STEP IS TO REPLY-ALL TO THIS MESSAGE.** (Please remember to click REPLY-ALL not just reply.)

{{{ event.emailSignature }}}
