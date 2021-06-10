---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: "[Action Required] CodeDay Labs Admission Offer"
---

Hi {{ student.givenName }},

Congratulations, we're excited to offer you acceptance to CodeDay Labs ({{ student.weeks }}-week program)!

You have been accepted in the {{ student.track }} track. This is the track we think is the best fit for you, but if you
have any concerns please reply to this email.

{{# when student.track 'eq' 'BEGINNER' }}**IMPORTANT:** There is a $250 fee for the beginner track, but need based
scholarships are available. [You can apply for a scholarship here.](https://labs.codeday.org/apply/beginner/scholarship) If you
are applying for a scholarship, please do not accept your offer yet.{{/when}}

As a participant in CodeDay Labs, you will work with a team of other students, under the guidance of a professional
software engineer mentor, to create or add features to an open-source software project.

You'll have 1-2 weekly team meetings, plus several 1-1s with your mentor throughout the program. Outside of team
meetings, TAs will be available to help you with debugging or other coding questions. You'll also have access to daily
tech talks, resume feedback, and practice interviews.

If you accept this offer, you are committing to:

1. Have enough time in your schedule to schedule meetings. (Most groups meet in the late afternoon or evening.)
2. Work on your project outside of meetings, and stay in contact with your team.
3. Put in **at least {{ student.minHours }} of work each week,** including meetings.

Participating in CodeDay Labs while you have a part-time job is very possible, but not if you have a full-time job.
If you accept a full-time job or internship offer we request that you withdraw from the program.

**Please choose an option within three days:{{#when student.track 'eq' 'BEGINNER'}} (unless requesting a scholarship){{/when}}**
- [I accept this offer!](https://labs.codeday.org/dash/s/{{ tokenFor student }}/offer-accept)
- [I do NOT accept, and want to cancel my application.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/withdraw)

Remember that while we aim to provide an internship-style experience, this isn't a paid internship and you won't be an
employee of CodeDay. (Don't worry, you can still include it on your LinkedIn and resume.)

Thank you! We hope to work with you this summer.

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
