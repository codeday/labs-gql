---
to: "{{ student.email }}"
subject: "Keep working?"
---

Hi {{ student.givenName }},

Are you interested in continuing to work on your open-source project, even though {{ event.name }} is over?

Our partner open-source projects would be thrilled if you continued contributing, and it will be much easier for
you now that you're familiar with the codebase and have the code building. Plus, potential employers like to see
multiple contributions to the same project.

## Access to TAs

We are happy to continue to provide you help from our TAs if you want to continue working on open-source. Here
is what you need to do:

1. [Schedule TA meeting within the next two weeks.](https://labs.codeday.org/dash/s/{{ tokenFor student }}/help)
2. Work with the TA to find a new issue in your open-source project.
3. Now you can continue to book TA meetings until your work is done!


## Payments for Documentation Improvements

Did you have problems getting your code to build, or understanding how your codebase was structured? If you
contributed to an existing OSS project (not something you created from scratch), CodeDay will pay for
improvements to documentation for new contributors in your assigned open-source project:

- $32 for small bug fixes in documentation (such as a broken link, missing or inaccurate instructions, etc).
- $64 for contributing a new section to existing documentation.
- $128 for creating a new contributing guide/tutorial, architecture overview, or other significant new documentation which your project did not previously have.

You can receive each payment type once per project, after your pull request is merged into the project's
repository. (For larger contributions, we recommend you check with the project maintainers first.)
Contributions must be related to helping new contributors onboard to the project (e.g., building the project
or navigating the codebase).

If you have made a documentation contribution, please reply to this email with the URL of your pull request.
(FYI for international students: if you receive more than $600 per year from CodeDay we will report the
earnings to the IRS on form 1099-MISC.)

{{{ event.emailSignature }}}