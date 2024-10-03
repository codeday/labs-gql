---
to: "{{ student.email }}"
subject: "Keep working?"
---

Hi {{ student.givenName }},

Are you interested in continuing to work on your open-source project, even though {{ event.name }} is over?

We are happy to continue to provide you help from our TAs if you want to continue working on open-source. Here
is what you need to do:

1. [Schedule TA meeting within the next two weeks.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/help)
2. Work with the TA to find a new issue in your open-source project.
3. Now you can continue to book TA meetings until your work is done!

Our partner open-source projects would be thrilled if you continued contributing, and it will be much easier for
you now that you're familiar with the codebase and have the code building. Plus, potential employers like to see
multiple contributions to the same project.

{{{ event.emailSignature }}}