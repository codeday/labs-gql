import { Matching, ProjectData } from './matchingTypes';
import {
  matchingStats,
  placeStudentsOfChoicesBalanced,
  range,
} from './matchingHelpers';

/**
 * Assigns students of choice starting from start going to limit in batches of size batch using the balanced
 * algorithm to break ties. Examples of use:
 *   step3(sampleData, 1, 1, 1) - Matches all first choice students it can
 *   step3(sampleData, 2, 2, 1) - Matches all second choice students it can
 *   step3(sampleData, 3, 20, 3) - Matches 3,4,5 then 5,6,7 then 8,9,10... etc until 20.
 *
 * @param allProjectData
 * @param start - Starting number, inclusive
 * @param end - The number to process until, inclusive
 * @param batch - The size of the batches of choices to work on at once.
 */
function matchChoices(allProjectData: ProjectData, start: number, end: number, batch: number): void {
  for (let startChoice = start; startChoice <= end; startChoice += batch) {
    // Avoid going over the limit in the last iteration
    const choices = startChoice + batch < end
      ? range(startChoice, startChoice + batch)
      : range(startChoice, end + 1);
    Object.values(allProjectData)
      .forEach((project) => {
        placeStudentsOfChoicesBalanced(allProjectData, project.projectId, choices, project.projSizeRemaining);
      });
  }
}

/**
 * Generates a single match of all students to projects. May have missing students.
 * @param data
 */
function generateMatch(data: ProjectData): Matching {
  matchChoices(data, 1, 1, 2);
  matchChoices(data, 3, 20, 1);
  return {
    match: data,
    stats: matchingStats(data),
  };
}

/**
 * Generates a match that probably has no unassigned students (very likely but not guaranteed, call again if it fails)
 * @param {ProjectData} data - The project information to create a match for. Will not be mutated.
 */
export function generateReliableMatch(data: ProjectData): Matching {
  const startTime = process.hrtime();
  let copyOfData = JSON.parse(JSON.stringify(data));
  let bestMatch: Matching = generateMatch(copyOfData);
  for (let i = 0; i < 50; i += 1) {
    copyOfData = JSON.parse(JSON.stringify(data));
    const match = generateMatch(copyOfData);
    if (match.stats.unassignedStudents < bestMatch.stats.unassignedStudents
      || (match.stats.unassignedStudents === bestMatch.stats.unassignedStudents
        && match.stats.matchingScore < bestMatch.stats.matchingScore)) {
      bestMatch = match;
    }
  }
  const endTime = process.hrtime(startTime);
  bestMatch.stats.runtimeMs = endTime[0] * 1000 + endTime[1] / 1000000;
  return bestMatch;
}
