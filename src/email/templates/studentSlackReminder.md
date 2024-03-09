---
to: "{{ student.email }}"
subject: "[ACTION REQUIRED] Join {{ event.name }} Slack (Reminder)"
---

Hi {{ student.givenName }},

As a participant in {{ event.name }}, you need to join the CodeDay Slack which,
according to our records, you have not yet done!

You should have already received an invite directly from Slack inviting you to join.
Please make sure you register with this email address: {{ student.email }}

**If you have already joined the Slack:** you likely registered with a different email address.
Please let us know which email address you used by replying to this message.

**If you didn't receive an invite:** reply to this message and we can resend it.

Participation in Slack is required to remain in the program!

{{{ event.emailSignature }}}