---
to: "{{ student.email }}"
subject: "{{ event.name }}: Acceptance Confirmation"
---

Hi {{ student.givenName }},

We're excited you have accepted your offer for {{ event.name }} ({{ student.weeks }}-week program).
Here's what you should know about the next steps:

1. The next step is **matching:** before the start of the program, we'll provide you with a number of
  project options, and you'll need to pick your favorites.
2. We will **introduce** you to your final project (one of your picks) a few days before the start of the program.
3. The first week of CodeDay Labs is **onboarding,** which is where you'll get up-to-speed on the technology used in your
  project by completing some workshops and tutorials recommended by your mentor.
4. You'll start on **project work** with your teammates after the first week.
5. At the end of CodeDay Labs, we will ask you to submit a 2-minute demo and 10-to-15-minute tech talk.

Some other pro-tips:

- When you list this on your resume or LinkedIn, use the title "{{ event.title }}", and start the description with:
  "Under the guidance of (mentor) from (company), worked on (project description)." Do not list that you are an employee
  of your mentor's company.
- If you're no longer able to spend your promised minimum {{ student.minHours }} hours a week on this, please let us
  know as soon as possible.
- {{ event.name }} is not a traditional internship, it's an educational opportunity. You're not an employee.
- If you need paperwork filled out for your school, please reply to this email.

If you have any questions, you can reply to this email.

{{{ event.emailSignature }}}