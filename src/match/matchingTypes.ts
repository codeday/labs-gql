export interface ProjectData {
  [projectId: string]: ProjectDataDictElement;
}

export interface ProjectDataDictElementCore {
  projectId: string;
  studentsSelected: StudentChoices;
  studentsMatched: StudentChoices;
  projSizeRemaining: number;
  numFirstChoice: number;
}

/// This gross thing is a match for having too many unnecessary fields in my testing data.
export interface ProjectDataDictElement extends ProjectDataDictElementCore {
  [x: string]: any;
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

export interface MatchingStatsInternal {
  totalProjects: number;
  totalStudents: number;
  unassignedStudents: number;
  unfilledSlots: number;
  matchingScore: number;
}

export interface MatchingStatsExternal extends MatchingStatsInternal {
  runtimeMs: number;
}

export interface MatchingInternal {
  match: ProjectData;
  stats: MatchingStatsInternal;
}

export interface MatchingExternal {
  match: ProjectData;
  stats: MatchingStatsExternal;
}
