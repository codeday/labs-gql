---
to: "{{ student.email }}"
subject: "[ACTION REQUIRED] Provide PR link for {{ event.name }}"
---

Hi {{ student.givenName }},

Congratulations on completing {{ event.name }}! As a celebration of your contribution to the open-source ecosystem, we'd like to send you a physical "Open Source Contributor" lapel pin (as well as a virtual badge for your LinkedIn profile).

Help us verify your contribution by [providing a link to your team's pull request here](https://labs.codeday.org/dash/s/{{ tokenFor student }}/add-pr). If you created a new project, provide a link to your team's open-source repository instead.

Once any member of your team provides this information, you'll all get an email to provide your mailing address for the lapel pin:

![image example](https://images.ctfassets.net/d5pti1xheuyu/1T5MRiBnVoQnsuo4Y1cb4w/c404a11e41b27d509d1e2bdaa44836d1/oss-contributor-pin-example_copy.jpg)

Thank you,

{{{ event.emailSignature }}}