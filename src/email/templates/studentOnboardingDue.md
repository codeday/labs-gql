---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: "[Action Required] Onboarding Week Assignments"
---

Hi {{ student.givenName }},

This is a reminder that you have outstanding onboarding week assignments.

[Click here to submit your onboarding week assignments.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/onboarding)

**You may be removed from the program if you do not complete your onboarding assignments.** 

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
