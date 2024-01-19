---
to: "{{ mentor.email }}"
{{#if mentor.managerUsername }}cc: "{{ mentor.managerUsername }}@codeday.org"{{/if}}
subject: "Your {{ event.name }} Mentees - {{ join (mapToKey project.students 'givenName') ', ' }}"
---

Hi {{ mentor.givenName }}, we're excited to say we've found you matches for the following project description:

<blockquote>{{ project.description }}</blockquote>

# Your Mentees

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