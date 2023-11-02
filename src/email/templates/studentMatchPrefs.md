---
to: "{{ student.email }}"
subject: "[Action Required] Submit Your Project Preferences"
---

Hi {{ student.givenName }},

We're excited you have accepted your offer for {{ event.name }}. We are now ready for you to submit your preferences:

[Click here to submit your preferences.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/matching)

We will recommend you several projects based on your interest, and as you to select and rank your top choices. (Projects
are shown less frequently as more students select them, so the sooner you submit your preferences, the better your
suggestions.)

**Please submit your preferences within the next 24 hours.** 

{{{ event.emailSignature }}}