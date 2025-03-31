
---
to: "{{ student.email }}"
subject: "Login Link for {{ event.name }} Dashboard"
---

You are receiving this email because you are participating in {{ event.name }} but your dashboard is not linked to a CodeDay account. Because you don't have an account, you will need to use the following link to log into your {{ even.name }} dashboard:

[Log into your {{ event.name }} dashboard](https://labs.codeday.org/dash/s/{{ tokenFor student }})

You will need to use your dashboard to submit onboarding assignments and complete reflections.

If you wish to link a CodeDay account, you can do so later from your dashboard. (This is completely optional!) Otherwise, please bookmark this email or link for later.

{{{ event.emailSignature }}}