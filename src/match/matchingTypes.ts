export interface ProjectData {
  [projectId: string]: ProjectDataDictElement
}

export interface ProjectDetails {
  projTags: string[];
  timezone: number;
  backgroundRural: boolean;
  bio: string;
  projDescription: string;
  preferStudentUnderRep: boolean;
  okExtended: boolean;
  okTimezoneDifference: boolean;
  preferToolExistingKnowledge: boolean;
  name: string;
  company?: string;
  track: string;
}

export interface ProjectDataDictElement extends ProjectDetails {
  projectId: string;
  studentsSelected: StudentChoices;
  studentsMatched: StudentChoices;
  projSizeRemaining: number;
  numFirstChoice: number;
}

export interface StudentChoices {
  [studentId: string]: StudentChoice
}

export interface Student {
  studentId: string;
}

export interface StudentChoice extends Student {
  choice: number;
  matched?: true | undefined // This works as a kind of default
}
