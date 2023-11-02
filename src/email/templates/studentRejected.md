---
to: "{{ student.email }}"
subject: "Your {{ event.name }} Application"
---

Hi {{ student.givenName }},

Unfortunately, we are not able to offer you acceptance to {{ event.name }} at this time. 

Although we cannot match you at this time, we hope you find a fun and valuable experience of some sort (even if it's
working on personal projects), and hope your future in tech is bright!

{{{ event.emailSignature }}}