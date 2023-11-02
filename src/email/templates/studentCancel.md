---
to: "{{ student.email }}"
subject: "{{ event.name }}: Withdrawl Confirmation"
---

Hi {{ student.givenName }},

This email confirms you have withdrawn your application/participation from {{ event.name }}.

{{{ event.emailSignature }}}