import { ProjectData } from './matchingTypes';
import {
  countStudentsOfChoices,
  placeStudentsOfChoice,
  placeStudentsOfChoicesBalanced,
  range
} from './matchingHelpers';

/**
 * Matches all first place students on projects with the same number of (or less) first choices as their size.
 * If a project has 5 spaces and 5 or less students who have that project as their first choice, then match all
 * those students.
 *
 * Formally, this is steps 1 and 2 from the python implementation
 * @param allProjectData  The project data, edited in place to add matches
 */
export function step1(allProjectData: ProjectData): void {
  Object.values(allProjectData)
    .forEach((project) => {
      placeStudentsOfChoicesBalanced(allProjectData, project.projectId, 1, project.projSizeRemaining);
    });
}

/**
 * Assigns second places on projects, preferring to do it simply if possible otherwise doing it balanced.
 * @param allProjectData
 */
export function step2(allProjectData: ProjectData): void {
  Object.values(allProjectData)
    .forEach((project) => {
      placeStudentsOfChoicesBalanced(allProjectData, project.projectId, 2, project.projSizeRemaining)
    });
}

/**
 * Assigns remaining spots (choices >= 3) in groups of size batch, up to limit
 * @param allProjectData
 * @param start
 * @param batch - The size of the batches of choices to work on at once.
 * @param limit - The upper limit of choices to process until
 */
export function step3(allProjectData: ProjectData, start: number, batch: number, limit: number) {
  for (let startChoice = start; startChoice < limit; startChoice += batch) {
    // Avoid going over the limit in the last iteration
    const choices = startChoice + batch < limit
      ? range(startChoice, startChoice + batch)
      : range(startChoice, limit + 1);

    Object.values(allProjectData)
      .forEach((project) => {
        placeStudentsOfChoicesBalanced(allProjectData, project.projectId, choices, project.projSizeRemaining);
      });
  }
}
