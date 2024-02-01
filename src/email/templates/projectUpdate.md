Hi team,

Your project has been updated:

{{# if newProject.issueUrl}}[{{newProject.issueUrl}}]({{newProject.issueUrl}}){{/if}}

**Description:**

<blockquote>
{{{ diff oldProject.description newProject.description }}}
</blockquote>

{{#if newProject.deliverables }}**Deliverables:**

{{diff oldProject.deliverables newProject.deliverables}}
{{/if}}