---
to: "{{ join (mapToKey project.students 'email') ',' }}, {{ join (mapToKey project.mentors 'email') ','}}"
cc: "{{ join (mentorManagers project '@codeday.org') ',' }}"
bcc: "labs@codeday.org"
subject: "[Action Required] {{ event.name }} Team Intro: {{{ join (mapToKey project.students 'givenName') ' <> ' }}} <> {{{ join (mapToKey project.mentors 'givenName') ' <> '}}}"
---

{{ join (names project.students) '/' }} (students), and {{ join (names project.mentors) '/'}} (mentors) -- welcome to {{ event.name }}! We have placed you together in a team, working on this project:

{{# if project.issueUrl}}[{{project.issueUrl}}]({{project.issueUrl}}){{/if}}

<blockquote>{{ project.description }}</blockquote>

{{#if project.deliverables }}**Deliverables:**

{{project.deliverables}}
{{/if}}

**ACTION REQUIRED -- NEXT STEPS:**

- **Mentors:** Send a [When2meet](https://www.when2meet.com/) for recurring meeting availability
- **Students:**
  - (1) reply to this email and introduce yourself (e.g. where you go to school, career goals, or anything else you want to share with your mentor)
  - (2) [log into your dashboard](https://labs.codeday.org/dash) to view any outstanding assignments
  - (3) once your mentor replies to this email with a When2Meet, make sure to fill it out

👉 **YOUR IMMEDIATE NEXT STEP IS TO REPLY-ALL TO THIS MESSAGE AS DESCRIBED ABOVE.**  
(Please remember to click REPLY-ALL not just reply.)

{{{ event.emailSignature }}}
