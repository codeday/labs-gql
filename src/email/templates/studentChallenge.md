---
to: "{{ student.email }}"
from: "labs@codeday.org"
subject: [Action Required] Labs Coding Challenge
---

Hi {{ student.givenName }},

We'd like more information about your coding abilities in order to make a final determination on your CodeDay Labs
application.

[Please click here to complete the coding challenge.](https://labs.codeday.org/apply/{{ lowercase student.track }}/challenge)

We've tried to make this challenge representative of the many ways people show coding talent. While there is no time
limit (so no pressure!) we want to be respectful of your time and ask that you don't spend too long on it.

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
