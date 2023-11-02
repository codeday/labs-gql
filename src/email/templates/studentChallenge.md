---
to: "{{ student.email }}"
subject: "[Action Required] Coding Challenge, {{ event.name }}"
---

Hi {{ student.givenName }},

We'd like more information about your coding abilities in order to make a final determination on your {{ event.name }}
application.

[Please click here to complete the coding challenge.](https://labs.codeday.org/apply/{{ event.id }}/{{ lowercase student.track }}/challenge)

We've tried to make this challenge representative of the many ways people show coding talent. While there is no time
limit (so no pressure!) we want to be respectful of your time and ask that you don't spend too long on it.

{{{ event.emailSignature }}}