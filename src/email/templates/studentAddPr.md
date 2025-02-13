---
to: "{{ student.email }}"
subject: "[ACTION REQUIRED] Provide PR link for {{ event.name }}"
---

Hi {{ student.givenName }},

Thanks for participating in {{ event.name }}! Once you have completed your contribution to the open-source ecosystem, we'd like to send you a physical "Open Source Contributor" lapel pin in celebration.

Help us verify your contribution by [providing a link to your team's pull request here](https://labs.codeday.org/dash/s/{{ tokenFor student }}/add-pr). If you created a new project, provide a link to your team's open-source repository instead.

Once any member of your team provides this information, you'll all get an email to provide your mailing address for the lapel pin:

![image example](https://shop.codeday.org/cdn/shop/files/DSC3243.jpg?v=1716496419&width=400)

Thank you,

{{{ event.emailSignature }}}