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
{{#when this.weeks 'gt' 8}}<span style="color: red">**Needs to meet at least once a week for an extra {{ add this.weeks -8}} weeks (total {{ add this.weeks -1}}) for school credit.**</span> This is within the extra time you mentioned you were able to spend, but contact us if this is a problem.{{/when}}

Info:

- **Email:** {{ this.email }}
- **Mentorship weeks:** {{ add this.weeks -1 }}
- **Track:** {{ this.track }}{{#each this.profile}}
- **{{ prettyCamel @key }}:** {{ prettyObj this }}{{/each}}

{{/each}}

{{{ event.emailSignature }}}