---
to: "{{ student.email }}"
bcc: "labs@codeday.org"
subject: "[Action Required] Onboarding Week Assignments"
---

Hi {{ student.givenName }},

This is a reminder that you have outstanding onboarding week assignments.

[Click here to submit your onboarding week assignments.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/onboarding)

**You may be removed from the program if you do not complete your onboarding assignments.** 

{{{ event.emailSignature }}}