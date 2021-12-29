export interface ProjectData {
  [projectId: string]: ProjectDataDictElement
}

export interface ProjectDataDictElement {
  projectId: string
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
