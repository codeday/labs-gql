---
to: "{{ join (mapToKey project.students 'email') ',' }}, {{ join (mapToKey project.mentors 'email') ','}}"
cc: "{{ join (mentorManagers project '@codeday.org') ',' }}"
from: "labs@codeday.org"
subject: "Team Intro: {{{ join (mapToKey project.students 'givenName') ' <> ' }}} <> {{{ join (mapToKey project.mentors 'givenName') ' <> '}}}"
---

**(PLEASE REMEMBER TO REPLY-ALL.)**

{{ join (names project.students) '/' }} (students), and {{ join (names project.mentors) '/'}} (mentors) --

Welcome to CodeDay Labs! We have placed you in a team, working on this project:

<blockquote>{{ project.description }}</blockquote>

**Your next step is to set up your first meeting. Mentors, can you please send a calendar schedule link.**

<div>
<div style="color: #484848;">--<br />The CodeDay Labs Team</div>
<div><br /><img src="https://f1.codeday.org/logo.png" /><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br />There's a place in tech for everyone.</a><a style="color: #bdbdbd; text-decoration: none;" href="https://www.youtube.com/watch?v=GKNBurEnGow" target="_blank" rel="noopener noreferrer"><br /></a></div>
</div>
