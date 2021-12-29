import { ProjectData } from './matching';
import { MatchingStats, placeStudentsOfChoice } from './matchingHelpers';

/**
 * Matches all first place students on projects with the same number of first choices as their size.
 * If a project has 5 spaces and 5 or less students who have that project as their first choice, then match all
 * those students
 * Formally, this is steps 1 and 2 from the python implementation
 * @param allProjectData  The project data, edited in place to add matches
 */
function step1(allProjectData: ProjectData): void {
  Object.values(allProjectData).forEach((value) => {
    if (value.numFirstChoice <= value.projSizeRemaining) {
      placeStudentsOfChoice(allProjectData, value.projectId, 1, value.projSizeRemaining);
    }
  });
}

/**
 * Runs the second step of matching
 * - Matches first place to all projects with less first places with
 * @param allProjectData
 */
function step2(allProjectData: ProjectData) {

}

async function place_student() {

}

let testProjectData: ProjectData = {
  zzz: {
    studentsSelected: {
      AA: {
        studentId: 'AA',
        choice: 1,
      },
      CC: {
        studentId: 'CC',
        choice: 2,
      },
    },
    projectId: 'zzz',
    projSizeRemaining: 1,
    numFirstChoice: 2,
    studentsMatched: {},
  },
  yyy: {
    studentsSelected: {
      AA: {
        studentId: 'AA',
        choice: 2,
      },
      BB: {
        studentId: 'BB',
        choice: 2,
      },
      CC: {
        studentId: 'CC',
        choice: 1,
      },
    },
    projectId: 'yyy',
    projSizeRemaining: 2,
    numFirstChoice: 1,
    studentsMatched: {},
  },
};

step1(testProjectData);
console.log(testProjectData);
console.log(MatchingStats(testProjectData));
