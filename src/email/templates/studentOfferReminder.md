---
to: "{{ student.email }}"
subject: "Re: [Action Required] {{ event.name }} Admission Offer"
---

This is just a reminder that we are still waiting on your response to your admissions offer. Please choose one of these two options:

- [I accept this offer!](https://labs.codeday.org/dash/s/{{ tokenFor student }}/offer-accept)
- [I do NOT accept, and want to cancel my application.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/withdraw)

{{{ event.emailSignature }}}


> Hi {{ student.givenName }},
> 
> Congratulations, we're excited to offer you acceptance to {{ event.name }} ({{ student.weeks }}-week program)!
> 
> You have been accepted in the {{ student.track }} track. This is the track we think is the best fit for you, but if you
> have any concerns please reply to this email.
> 
> As a participant in {{ event.name }}, you will work with a team of other students, under the guidance of a professional
> software engineer mentor, to create or add features to an open-source software project.
> 
> Working with the help of your teammates, mentor, and our coding support staff, you'll learn about a real-world software
> engineering project and create a contribution in {{ student.weeks }} weeks!
> 
> If you accept this offer, you are committing to:
> 
> 1. Have enough time in your schedule to schedule meetings. (Most groups meet in the late afternoon or evening.)
> 2. Work on your project outside of meetings, and stay in contact with your team.
> 3. Put in **at least {{ student.minHours }} of work each week,** including meetings.
> 
> **Please choose an option within three days:**
> - [I accept this offer!](https://labs.codeday.org/dash/s/{{ tokenFor student }}/offer-accept)
> - [I do NOT accept, and want to cancel my application.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/withdraw)
> 
> Remember that while we aim to provide an internship-style experience, this isn't a paid internship and you won't be an
> employee. (Don't worry, you can still include it on your LinkedIn and resume.)
> 
> Thank you! We hope to work with you soon!
> 
> {{{ event.emailSignature }}}