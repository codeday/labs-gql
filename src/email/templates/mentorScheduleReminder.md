---
to: "{{ mentor.email }}"
{{#if mentor.managerUsername }}cc: "{{ mentor.managerUsername }}@codeday.org"{{/if}}
subject: "[ACTION REQUIRED] Reminder to schedule {{ event.name }} meeting"
---

Hi {{ mentor.givenName }},

This is a reminder that you should have:

1. Sent a [When2meet](https://www.when2meet.com/) for recurring meeting availability.
2. Picked a meeting time from that When2meet.
3. Scheduled your first meeting.

You do not need to prepare anything for your first meeting. Students should come prepared with
their "Existing OSS" or "New Project from Scratch" worksheet; the agenda for the first meeting
will be for the group to discuss these and for you to provide feedback based on your experience.

**Please make sure you have scheduled your meeting!**

Thank you!

{{{ event.emailSignature }}}