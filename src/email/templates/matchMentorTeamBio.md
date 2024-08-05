---
to: "{{ mentor.email }}" {{#if mentor.managerUsername }}, "{{ mentor.managerUsername }}@codeday.org"{{/if}}
subject: "Your {{ event.name }} Mentees - {{ join (mapToKey project.students 'givenName') ', ' }}"
---

Hi {{ mentor.givenName }}, we're excited to say we've found you matches for the following project description:

<blockquote>{{ project.description }}</blockquote>


# Action Items

Your next steps are:

* Introduce yourself to your students via **the separate email chain we just sent you**
* Send a [When2meet](https://www.when2meet.com/) to your students to select a good time for your first meeting
* Once your When2meet is filled out, send a calendar invite for your first meeting
* (Optional) Join the CodeDay Labs Slack using the invite sent directly from Slack

{{#if mentor.managerUsername }}We've assigned you an assistant to help you throughout {{ event.name }} who will be keeping in touch throughout the program. They're in this email chain, and can be reached at: {{ mentor.managerUsername }}@codeday.org{{/if}}


# Your Mentees

**As a reminder, you can always check the latest information [in your mentoring dashboard](https://labs.codeday.org/dash/m/{{ tokenFor mentor }})**

{{#each project.students}}
-----
## {{ this.givenName }} {{ this.surname }}
Info:

- **Email:** {{ this.email }}
- **Mentorship weeks:** {{ add this.weeks -1 }}
- **Track:** {{ this.track }}{{#each this.profile}}
- **{{ prettyCamel @key }}:** {{ prettyObj this }}{{/each}}

{{/each}}

{{{ event.emailSignature }}}
