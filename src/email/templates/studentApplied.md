---
to: "{{ student.email }}"
subject: "{{ event.name }}: Application Received"
---

Hi {{ student.givenName }},

This email confirms we have received your {{ event.name }} application.

We do rolling admissions as space becomes available, so you may hear back from us at any time, and we can't provide
an estimate. Do not wait to hear from us before applying for traditional, paid internships or other opportunities.

If we're able to offer you a spot, you will get an email here and have three days to accept.

{{{ event.emailSignature }}}