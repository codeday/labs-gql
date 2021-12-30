import { ProjectData, ProjectDataDictElement, StudentChoice } from './matchingTypes';

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
 * A very basic implementation of python's range function, used to generate an array of numbers from a start
 * (inclusive) and end (exclusive)
 * @param start - The start of the range, inclusive
 * @param stop - The end of the range, exclusive
 */
export function range(start: number, stop: number): number[] {
  const arr = [];
  for (let i = start; i < stop; i += 1) {
    arr.push(i);
  }
  return arr;
}

/**
 * Checks to see if a StudentChoice matches either a choice number or an array of choice numbers
 * @param choice
 * @param studentChoice
 */
function compareChoice(choice: number[] | number, studentChoice: StudentChoice): boolean {
  return Array.isArray(choice)
    ? (choice as number[]).includes(studentChoice.choice)
    : studentChoice.choice === (choice as number);
}

/**
 * Counts the number of unmarked students on a project who voted for it with a given choice.
 * @param project
 * @param choice
 */
export function countStudentsOfChoices(project: ProjectDataDictElement, choice: number[] | number): number {
  return Object.values(project.studentsSelected)
    .filter(
      (student) => student.matched !== true,
      // eslint-disable-next-line arrow-body-style
    )
    .reduce((secondChoiceCounter, student) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line no-bitwise
      return secondChoiceCounter + ((compareChoice(choice, student)) | 0);
    }, 0);
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
 * @param choice The choice number(s) to look at
 * @param count The number of students to match
 */
export function placeStudentsOfChoice(
  projectData: ProjectData,
  projectId: string,
  choice: number[] | number,
  count: number,
): void {
  // Handle the options for choice
  let counter = 0;
  // Iterate over only unmatched students to avoid duplicates
  for (const studentChoice of Object.values(projectData[projectId].studentsSelected)
    .filter((value) => value.matched !== true)) {
    if (compareChoice(choice, studentChoice)) {
      placeStudent(projectData, projectId, studentChoice.studentId);
      counter += 1;
    }
    if (counter >= count) break;
  }
}

/**
 * Counts the number of votes a certain student has remaining in non-filled projects.
 * @param projectData
 * @param studentId
 */
function countStudentVotes(projectData: ProjectData, studentId: string): number {
  return Object.values(projectData)
    .filter((project) => project.projSizeRemaining > 0)
    .reduce((previousCount, project) => {
      const doesStudentExist = Object.keys(
        project.studentsSelected,
      )
        .some((id) => id === studentId);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line no-bitwise
      return previousCount + (doesStudentExist | 0);
      // Prev line casts a bool to an int very fast (2 orders of mag faster than other methods)
    }, 0);
}

/**
 * Places students similar to placeStudentsOfChoice, however it is smarter and will break ties by removing the
 * student who appears least frequently in other remaining votes. This is based on the assumption that this person
 * will be the most likely to accidentally have all their voted projects filled up on then.
 * @param projectData
 * @param projectId
 * @param choice
 * @param count
 */
export function placeStudentsOfChoicesBalanced(
  projectData: ProjectData,
  projectId: string,
  choice: number[] | number,
  count: number,
): void {
  // A list of all unmarked students matching the choice
  const students: StudentChoice[] = Object.values(projectData[projectId].studentsSelected)
    .filter((student) => compareChoice(choice, student) && student.matched !== true);
  // An array of mappings from student IDs to the number of votes they have on non-filled projects
  const studentFrequency: [string, number][] = students.map(
    (student) => [student.studentId, countStudentVotes(projectData, student.studentId)],
  );
  // Sort with least occurrences at the start
  studentFrequency.sort((a, b) => a[1] - b[1]);

  // Get the first few count students and apply them
  studentFrequency.slice(0, count)
    .forEach((student) => placeStudent(projectData, projectId, student[0]));
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
function unassignedStudentsCount(projectData: ProjectData): number {
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
 * Returns the set of all unmatched student IDs
 * @param projectData
 */
export function unassignedStudentProjects(projectData: ProjectData): { [key: string]: ProjectDataDictElement[] } {
  const countedStudentIds: { [key: string]: ProjectDataDictElement[] } = {};
  Object.values(projectData)
    .forEach((project) => {
      const unmatchedStudents = Object.values(
        project.studentsSelected,
      )
        .filter((student) => student.matched !== true);
      // For each unmatched student, go through and add the project we found it in to the return
      unmatchedStudents.forEach((student) => {
        if (countedStudentIds[student.studentId] === undefined) countedStudentIds[student.studentId] = [project];
        countedStudentIds[student.studentId].push(project);
      });
    }, 0);
  Object.keys(countedStudentIds).forEach((studentId) => {
    countedStudentIds[studentId].sort(
      (a, b) => a.studentsSelected[studentId].choice - b.studentsSelected[studentId].choice,
    );
  });
  return countedStudentIds;
}

/**
 * Measures the effectiveness of a match, or the choice rank number that all students got divided by the number of
 * students
 * @param projectData
 * @param totalStudents
 */
function measureMatchEffectiveness(projectData: ProjectData, totalStudents: number) {
  const rawScore = Object.values(projectData)
    .reduce((sumScoreOverall, currentProject) => sumScoreOverall
      + Object.values(currentProject.studentsMatched)
        .reduce((sumScore, currentStudent) => sumScore + currentStudent.choice, 0), 0);
  return rawScore / totalStudents;
}

/**
 * Combines a bunch of relevant stats about a matching to check how it's doing
 * @param projectData
 * @constructor
 */
export function MatchingStats(projectData: ProjectData): Record<string, number> {
  // eslint-disable-next-line func-names
  const totalStudents = (function () {
    const totalStudentsSet = new Set<string>();
    Object.values(projectData)
      .forEach((project) => {
        Object.values(project.studentsSelected)
          .forEach((student) => {
            totalStudentsSet.add(student.studentId);
          });
      });
    return totalStudentsSet.size;
  }());
  return {
    totalProjects: Object.keys(projectData).length,
    totalStudents,
    unassignedStudents: unassignedStudentsCount(projectData),
    unfilledSlots: countUnfilled(projectData),
    matchingScore: measureMatchEffectiveness(projectData, totalStudents),
  };
}

//
//
// placeStudentsOfChoice(testProjectData, 'zzz', 1, 1);
// placeStudentsOfChoice(testProjectData, 'yyy', 1, 1);
// import { inspect } from 'util';
//
// console.log(inspect(testProjectData, {showHidden: true, depth: 3, colors: true}));
