---
to: "{{ student.email }}"
subject: "[Action Required] Interview, {{ event.name }}"
---

Hi {{ student.givenName }},

We'd like more information about your experience in order to make a final determination on your {{ event.name }}
application.

[Click here to set up an interview.](https://calendly.com/codeday-labs/applicant-interview)

{{{ event.emailSignature }}}