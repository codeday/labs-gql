---
to: "{{ student.email }}"
subject: "Project Preferences Overdue"
---

{{ student.givenName }},

This is your final reminder to submit your project preferences ASAP.

**Any students without project preferences will soon be removed from the program.**

[Click here to submit your preferences.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/matching)

{{{ event.emailSignature }}}