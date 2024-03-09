---
to: "{{ student.email }}"
subject: "[ACTION REQUIRED] Join {{ event.name }} Slack"
---

Hi {{ student.givenName }},

As a participant in {{ event.name }}, you will need to log into the CodeDay Slack at [https://codedayorg.slack.com/](https://codedayorg.slack.com/).

If you have not previously participated in one of our programs, you should have received an email from Slack inviting
you to join. Otherwise, you can log in using the same email and password as last time.

You will use Slack to participate in text-based stand-ups and to communicate with your teammates. Joining Slack is required,
and we recommend you install the mobile or desktop app so you can receive notifications.

Thank you,

{{{ event.emailSignature }}}