---
to: "{{ student.email }}"
subject: "[Action Required] Pending Removal from {{ event.name }}"
---

Hi {{ student.givenName }},

As a reminder, you have not yet completed any onboarding assignments. **Unless you make progress on your onboarding assignments, you may be removed within the next few days.**

[Click here to submit your onboarding week assignments.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/onboarding)

{{{ event.emailSignature }}}