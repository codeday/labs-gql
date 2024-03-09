---
to: "{{ student.email }}"
subject: "How to schedule TA meetings in {{ event.name }}"
---

Hi {{ student.givenName }},

As you begin to work on your project, you will likely find yourself stuck from time-to-time.

Rather than waiting for your next mentor meeting, you can now request help from CodeDay's TAs using the link below. You can
attend individually, or as a group.

[Schedule TA meeting!](https://labs.codeday.org/dash/s/{{ tokenFor student }}/help)

{{{ event.emailSignature }}}