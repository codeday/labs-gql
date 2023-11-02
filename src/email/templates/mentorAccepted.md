---
to: "{{ mentor.email }}"
subject: "Welcome to {{ event.name }}"
---

We're so excited to have you as a mentor at {{ event.name }}, {{ mentor.givenName }}!

**Important:** [Please review and make any changes to your project here.](https://labs.codeday.org/dash/m/{{ tokenFor mentor }}) The details provided will be shared with students.

Some other next-steps to expect:

- We'll provide you with some training information (including schedule, what resources your students have, and protips)
  if we haven't already.
- You can expect to be introduced to your students one week before {{ event.name }} starts (during student onboarding week).

{{{ event.emailSignature }}}