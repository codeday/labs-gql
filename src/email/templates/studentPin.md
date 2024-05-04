---
to: "{{ student.email }}"
subject: "Mailing address for lapel pin"
---

Hi {{ student.givenName }},

Congratulations on your contribution to open-source in {{ event.name }}, and thank you (or your teammate) for providing the URL of your PR for verification!

As a celebration of your contribution to the open-source ecosystem, we'd like to send you a physical "Open Source Contributor" lapel pin.

[Provide your mailing address for your lapel pin here.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/address)

![image example](https://images.ctfassets.net/d5pti1xheuyu/1T5MRiBnVoQnsuo4Y1cb4w/c404a11e41b27d509d1e2bdaa44836d1/oss-contributor-pin-example_copy.jpg)

Thank you,

{{{ event.emailSignature }}}