---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: "[Action Required] Submit Your Project Preferences"
---

Hi {{ student.givenName }},

We're excited you have accepted your offer for CodeDay Labs. We are now ready for you to submit your preferences:

[Click here to submit your preferences.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/matching)

We will recommend you several projects based on your interest, and as you to select and rank your top choices. (Projects
are shown less frequently as more students select them, so the sooner you submit your preferences, the better your
suggestions.)

**Please submit your preferences _as soon as possible_.** 

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
