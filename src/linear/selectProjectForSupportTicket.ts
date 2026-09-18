// Selects the project a support ticket should be filed against for a given member.
//
// `addNote` (the manager-facing escalation path) may file a Linear ticket on behalf of a
// student who can belong to more than one project. The resolver must not silently pick
// `projects[0]` for a multi-project member, because the per-(project, type) dedup guard and
// the ticket's project-context block are both keyed off the chosen project. This helper
// therefore requires an explicit, caller-chosen `projectId` whenever the member is on more
// than one project, and validates membership when one is supplied. The single-project case
// (the common, designed-matching case) remains unambiguous and needs no `projectId`.
export function selectProjectForSupportTicket<T extends { id: string }>(
  projects: T[],
  projectId?: string,
): T {
  if (projectId) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error('Student is not a member of the specified project.');
    }
    return project;
  }

  if (projects.length === 1) {
    return projects[0];
  }

  throw new Error('Student is on multiple projects; projectId is required to file a support ticket.');
}
