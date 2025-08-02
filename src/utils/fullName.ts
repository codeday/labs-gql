import { Mentor, Student } from "@prisma/client";

export function fullName(person: Student | Mentor) {
  return person.givenName + ' ' + person.surname;
}