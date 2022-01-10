export interface ProjectData {
  [projectId: string]: ProjectDataDictElement;
}

export interface ProjectDataDictElement {
  projectId: string;
  studentsSelected: StudentChoices;
  studentsMatched: StudentChoices;
  projSizeRemaining: number;
  numFirstChoice: number;
  [x: string]: any; // Patch for testing data having too much going on, TODO: remove once postgres data arrives
}

export interface StudentChoices {
  [studentId: string]: StudentChoice;
}

export interface Student {
  studentId: string;
}

export interface StudentChoice extends Student {
  choice: number;
  matched?: true | undefined; // This works as a kind of default
}

export interface MatchingStats {
  totalProjects: number;
  totalStudents: number;
  unassignedStudents: number;
  unfilledSlots: number;
  matchingScore: number;
  runtimeMs?: number
}

export interface Matching {
  match: ProjectData;
  stats: MatchingStats;
}
