---
to: "{{ student.email }}"
subject: "Mailing address for lapel pin"
---

Hi {{ student.givenName }},

Congratulations on your contribution to open-source in {{ event.name }}, and thank you (or your teammate) for providing the URL of your PR for verification!

As a celebration of your contribution to the open-source ecosystem, we'd like to send you a physical "Open Source Contributor" lapel pin.

[Order your pin here,](https://shop.codeday.org/products/open-source-software-contributor-lapel-pin) and enter the following discount code at checkout: **YS141YY0R2HP** (If you already have an open-source contributor pin, you can use the same code to get any other $10 item for free.)

![image example](https://shop.codeday.org/cdn/shop/files/DSC3243.jpg?v=1716496419&width=400)

Thank you,

{{{ event.emailSignature }}}