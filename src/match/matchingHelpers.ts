import { ProjectData } from './matching';

// async function generateProjectData(projects: [Project]) {
//   return Object.fromEntries(
//     projects.map((project) => {
//       const key = project.id
//       const value:  = {
//
//       }
//     })
//   )
// }

function indexOfMatch<T>(array: Array<T>, fn: (element: T) => boolean) {
  let result = -1;
  array.some((e, i) => {
    if (fn(e)) {
      result = i;
      return true;
    }
    return false;
  });
  return result;
}

/**
 * Marks a student in all project's `studentsSelected` as having been matched somewhere already
 * @param projectData - The project data, mutated in place
 * @param studentId - Student to mark
 */
function markStudent(projectData: ProjectData, studentId: string): void {
  Object.values(projectData)
    .forEach((value) => {
      if (value.studentsSelected[studentId] !== undefined) {
        // eslint-disable-next-line no-param-reassign
        value.studentsSelected[studentId].matched = true;
      }
    });
}

/**
 * Places a student into a project and then marks them as matched in all projects. Handles correctly updating the
 * number of needed students and decrementing num_first_choice
 * @param projectData
 * @param projectId
 * @param studentId
 */
function placeStudent(projectData: ProjectData, projectId: string, studentId: string): void {
  const project = projectData[projectId];
  const student = project.studentsSelected[studentId];
  const firstChoice: boolean = student.choice === 1;
  // eslint-disable-next-line no-param-reassign
  projectData[projectId].studentsMatched[student.studentId] = student;
  markStudent(projectData, studentId);
  project.projSizeRemaining -= 1;
  if (firstChoice) project.numFirstChoice -= 1;
}

/**
 * Places num students of choice on a project or until all students of choice have been placed. NOT balanced by
 * anything, only use when you do not expect to have more students to match than num
 * @param projectData The project data
 * @param projectId The project to match
 * @param choice The choice of students to match
 * @param count The number of students to match
 */
export function placeStudentsOfChoice(
  projectData: ProjectData,
  projectId: string,
  choice: number,
  count: number,
): void {
  let counter = 0;
  // Iterate over only unmatched students to avoid duplicates
  for (const studentChoice of Object.values(projectData[projectId].studentsSelected)
    .filter((value) => value.matched !== true)) {
    if (studentChoice.choice === choice) {
      placeStudent(projectData, projectId, studentChoice.studentId);
      counter += 1;
    }
    if (counter >= count) break;
  }
}

/**
 * Counts the number of open spots left in projects
 * @param projectData
 */
function countUnfilled(projectData: ProjectData) {
  return Object.values(projectData)
    .reduce((prevVal, currentVal) => prevVal + currentVal.projSizeRemaining, 0);
}

/**
 * Counts the number of unmarked students (students that didn't get applied to anything)
 * @param projectData
 */
function unassignedStudents(projectData: ProjectData) {
  const countedStudentIds: string[] = [];
  return Object.values(projectData)
    .reduce((previousValue, currentValue) => {
      const unmatchedStudents = Object.values(
        currentValue.studentsSelected,
      )
        .filter((student) => student.matched !== true && !countedStudentIds.includes(student.studentId));
      countedStudentIds.push(...unmatchedStudents.map((student) => student.studentId));
      return previousValue + unmatchedStudents.length;
    }, 0);
}

/**
 * Measures the effectiveness of a match, or the choice rank number that all students got divided by the number of
 * students
 * @param projectData
 */
function measureMatchEffectiveness(projectData: ProjectData) {
  const rawScore = Object.values(projectData)
    .reduce((sumScoreOverall, currentProject) => {
      return sumScoreOverall
        + Object.values(currentProject.studentsSelected)
          .reduce((sumScore, currentStudent) => sumScore + currentStudent.choice, 0);
    }, 0);
  const totalStudentsSet = new Set<string>();
  Object.values(projectData)
    .forEach((project) => {
      Object.values(project.studentsSelected)
        .forEach((student) => {
          totalStudentsSet.add(student.studentId);
        });
    });
  const totalStudents = totalStudentsSet.size;
  return rawScore / totalStudents;
}

/**
 * Combines a bunch of relevant stats about a matching to check how it's doing
 * @param projectData
 * @constructor
 */
export function MatchingStats(projectData: ProjectData): Record<string, number> {
  return {
    unassignedStudents: unassignedStudents(projectData),
    unfilledProjects: countUnfilled(projectData),
    matchingScore: measureMatchEffectiveness(projectData),
  };
}

//
//
// placeStudentsOfChoice(testProjectData, 'zzz', 1, 1);
// placeStudentsOfChoice(testProjectData, 'yyy', 1, 1);
// import { inspect } from 'util';
//
// console.log(inspect(testProjectData, {showHidden: true, depth: 3, colors: true}));
