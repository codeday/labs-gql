---
to: "{{ student.email }}"
subject: "Re: [Action Required] Submit Your Project Preferences"
---

Hi {{ student.givenName }},

This is a reminder that you have not yet submitted your project preferences. **If you do not submit your preferences you will not be matched.**

[Click here to submit your preferences.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/matching)

{{{ event.emailSignature }}}