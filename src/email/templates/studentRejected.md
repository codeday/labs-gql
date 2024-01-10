---
to: "{{ student.email }}"
subject: "Your {{ event.name }} Application"
---

Hi {{ student.givenName }},

Unfortunately, we are not able to offer you acceptance to {{ event.name }} at this time. 

Although we cannot match you at this time, we hope you can find another fun and valuable
experience (whether an internship or in working on personal projects).

If you would like personalized feedback about your application, please reply to this email. 
(At busy times of the year it may take several weeks to get back to you, so please be patient.)

We hope your your future in tech is bright!

{{{ event.emailSignature }}}