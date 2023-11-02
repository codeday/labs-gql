---
to: "{{ join (mapToKey project.students 'email') ',' }}, {{ join (mapToKey project.mentors 'email') ','}}"
cc: "{{ join (mentorManagers project '@codeday.org') ',' }}"
subject: "{{ event.name }} Team Intro: {{{ join (mapToKey project.students 'givenName') ' <> ' }}} <> {{{ join (mapToKey project.mentors 'givenName') ' <> '}}}"
---

**(PLEASE REMEMBER TO REPLY-ALL.)**

{{ join (names project.students) '/' }} (students), and {{ join (names project.mentors) '/'}} (mentors) --

Welcome to CodeDay Labs! We have placed you together in a team, working on this project:

<blockquote>{{ project.description }}</blockquote>

**NEXT STEPS:**

- **Mentors:** Can you please send a When2meet (or other calendar scheduling link) for the first meeting?
- **Students:** (1) introduce yourself, (2) [log into your dashboard](https://labs.codeday.org/dash) to view any outstanding assignments, (3) start taking to your teammates to decide on a work session schedule.

{{{ event.emailSignature }}}