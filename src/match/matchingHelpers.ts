import assert from 'assert';
import { Project, ProjectPreference } from '@prisma/client';
import {
  MatchingStats, ProjectData, StudentChoice, StudentChoices,
} from './matchingTypes';

/* Randomize array in-place using Durstenfeld shuffle algorithm https://stackoverflow.com/a/12646864 */
function shuffleArray<T>(array: Array<T>): void {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    // eslint-disable-next-line no-param-reassign
    [array[i], array[j]] = [array[j], array[i]];
  }
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
  // We should never try to match a student that's already been matched
  assert(
    student.matched !== true,
    `Tried to place a student that's already been matched ${JSON.stringify(student)}`,
  );
  // eslint-disable-next-line no-param-reassign
  projectData[projectId].studentsMatched[student.studentId] = student;
  markStudent(projectData, studentId);
  project.projSizeRemaining -= 1;
  if (firstChoice) project.numFirstChoice -= 1;
}

/**
 * Counts the number of votes a certain student has remaining in non-filled projects.
 * @param projectData
 * @param studentId
 */
function countStudentVotes(projectData: ProjectData, studentId: string): number {
  return Object.values(projectData)
    // Only look at non-filled projects
    .filter((project) => project.projSizeRemaining > 0)
    // Sum the number of these projects that contain the given studentId
    .reduce((previousCount, project) => {
      // Check if the student exists in the studentSelected
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
 * Counts the number of unmarked students on a project who voted for it with a given choice.
 * @param studentsSelected
 * @param choice
 */
export function countStudentsOfChoices(studentsSelected: StudentChoices, choice: number[] | number): number {
  return Object.values(studentsSelected)
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
  // An array of students on this project who have only one remaining project
  const singleStudents: [string, number][] = Object.values(projectData[projectId].studentsSelected)
    .filter((student) => student.matched !== true)
    .map(
      (student): [string, number] => [student.studentId, countStudentVotes(projectData, student.studentId)],
    )
    .filter(
      (studentVotes) => studentVotes[1] === 1,
    );

  // Randomize the array and then match as many single students as possible.
  let counter = 0;
  shuffleArray(singleStudents);
  singleStudents.slice(0, count)
    .forEach((student) => {
      placeStudent(projectData, projectId, student[0]);
      counter += 1;
    });

  // An array of mappings from student IDs to the number of votes they have on non-filled projects for unmarked
  // students matching the choice
  const studentFrequency: [string, number][] = Object.values(projectData[projectId].studentsSelected)
    .filter((student) => compareChoice(choice, student) && student.matched !== true)
    .map(
      (student) => [student.studentId, countStudentVotes(projectData, student.studentId)],
    );
  // Sort with least occurrences at the start and randomize the order within blocks of the same number of occurrences
  studentFrequency.sort((a, b) => {
    let value = a[1] - b[1];
    if (value === 0) {
      value = 0.5 - Math.random();
    }
    return value;
  });

  // Get the first few count students and apply them to any remaining slots. This count and counter thing will always
  // work, slice handles all this very nicely.
  studentFrequency.slice(0, count - counter)
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
export function matchingStats(projectData: ProjectData): MatchingStats {
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

export function parsePrismaData(prismaData: (Project & {projectPreferences: ProjectPreference[]})[]): ProjectData {
  const projectData: ProjectData = {};
  prismaData.forEach((prismaProject) => {
    // Generate the student choices
    const studentsSelected: StudentChoices = {};
    prismaProject.projectPreferences.forEach((prismaStudentChoice) => {
      studentsSelected[prismaStudentChoice.studentId] = {
        studentId: prismaStudentChoice.studentId,
        choice: prismaStudentChoice.ranking,
      };
    });
    // Fill in the rest of the data
    projectData[prismaProject.id] = {
      studentsSelected,
      projectId: prismaProject.id,
      numFirstChoice: countStudentsOfChoices(studentsSelected, 1),
      projSizeRemaining: Object.keys(studentsSelected).length,
      studentsMatched: {},
    };
  });
  return projectData;
}
