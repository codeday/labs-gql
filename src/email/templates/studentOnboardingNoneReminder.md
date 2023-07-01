---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: "[Action Required] Pending Removal from CodeDay Labs"
---

Hi {{ student.givenName }},

As a reminder, you have not yet completed any onboarding assignments. **Unless you make progress on your onboarding assignments, you may be removed within the next few days.**

[Click here to submit your onboarding week assignments.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/onboarding)

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
