---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: "Re: [Action Required] Submit Your Project Preferences"
---

Hi {{ student.givenName }},

This is a reminder that you have not yet submitted your project preferences. **If you do not submit your preferences you will not be matched.**

[Click here to submit your preferences.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/matching)

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>