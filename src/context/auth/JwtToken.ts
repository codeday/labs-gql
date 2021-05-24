export enum AuthRole {
  ADMIN = 'a',
  MANAGER = 'mm',
  REVIEWER = 'r',
  STUDENT = 's',
  MENTOR = 'm',
  APPLICANT_MENTOR = 'am',
  APPLICANT_STUDENT = 'as',
}

export enum AuthByTarget {
  ID = 'i',
  USERNAME = 'u',
}

export interface JwtToken {
  typ: AuthRole
  sid?: string
  tgt?: AuthByTarget
}
