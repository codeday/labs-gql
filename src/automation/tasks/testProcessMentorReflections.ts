import 'reflect-metadata';
import assert from 'assert';
import { extractAttendedStudentIds } from './processMentorReflections';

function sorted(values: Set<string>): string[] {
  return [...values].sort();
}

function run(): void {
  const studentIds = ['s1', 's2', 's3'];

  {
    const result = extractAttendedStudentIds({ studentAttendance: ['s1', 's3'] }, studentIds);
    assert.deepStrictEqual(sorted(result), ['s1', 's3']);
  }

  {
    const result = extractAttendedStudentIds({ studentsPresent: ['s2'] }, studentIds);
    assert.deepStrictEqual(sorted(result), ['s2']);
  }

  {
    const result = extractAttendedStudentIds({ studentsAbsent: ['s2'] }, studentIds);
    assert.deepStrictEqual(sorted(result), ['s1', 's3']);
  }

  {
    const result = extractAttendedStudentIds(
      {
        studentAttendance: ['s1', 's2'],
        studentsAbsent: ['s2'],
      },
      studentIds
    );
    assert.deepStrictEqual(sorted(result), ['s1']);
  }

  {
    const result = extractAttendedStudentIds(
      {
        studentAttendance: ['s1', 'unknown-student'],
        studentsAbsent: ['another-unknown'],
      },
      studentIds
    );
    assert.deepStrictEqual(sorted(result), ['s1']);
  }

  // eslint-disable-next-line no-console
  console.log('processMentorReflections tests passed');
}

run();
