---
to: "{{ mentor.email }}"
subject: "[Action Required] Virtual Mentoring Information for {{ event.name }}"
---

{{ mentor.givenName }}, we're so excited to have you as a virtual mentor at {{ event.name }}, with your mentorship starting the week of {{ prettyDate (nextWeek event.startsAt) }}!

Here are the next steps:

- [Review and make any changes to your profile here.](https://labs.codeday.org/dash/m/{{ tokenFor mentor }}) The details provided will be shared with students for matching purposes.
- [Review the training information.](https://codeday.notion.site/Mentor-Training-379764d4bc1e46bc9fbdeb1bc0a949ae?pvs=4)
- You will be introduced to your students by email about a week before we expect you to start meeting with students. 

Your mentorship will start the week of {{ prettyDate (nextWeek event.startsAt) }} and last for {{ add event.defaultWeeks -1 }} weeks (unless you agreed to mentor for longer). Specific meetings will be virtual, and you can schedule them according to your availability after you are introduced.

**Important:** If this timeframe does not work for you please let us know ASAP by replying to this email.

{{{ event.emailSignature }}}