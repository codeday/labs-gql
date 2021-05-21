export enum AuthRole {
  ADMIN = 'a',
  MANAGER = 'm',
  REVIEWER = 'r',
  STUDENT = 's',
  MENTOR = 'm',
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
