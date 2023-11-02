---
to: "{{ mentor.email }}"
subject: "Project Draft Reminder"
---

{{ mentor.givenName }}, you have a project which is currently in DRAFT status. Can you give it a quick look and, if
it looks good, click the Save and Submit button?

[You can review and submit your project here.](https://labs.codeday.org/dash/m/{{ tokenFor mentor }})

(This is an automated email, if we're already working with you on this project feel free to ignore it.)

{{{ event.emailSignature }}}