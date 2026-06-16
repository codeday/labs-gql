/**
 * Manual test script for weeklyLowStandupReport
 *
 * Prerequisites:
 * - Copy .env.test.example to .env (if you don't have a .env file):
 *     cp .env.test.example .env
 *
 * Run with:
 *   npx ts-node src/automation/tasks/weeklyLowStandupReport.manual-test.ts
 *
 * This tests the pure functions (findConsecutiveLowScores and formatStudentList)
 * imported from the actual implementation file to ensure tests stay in sync with code.
 */

import 'reflect-metadata';
import { findConsecutiveLowScores, formatStudentList } from './weeklyLowStandupReport';

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual:   ${actualStr}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('\n🧪 Testing findConsecutiveLowScores...\n');

// Test 1: Student with fewer than 2 results
const result1 = findConsecutiveLowScores({
  id: 'student-1',
  givenName: 'Alice',
  surname: 'Smith',
  slackId: 'U123456',
  standupResults: [{ rating: 1 }],
}, 'Test Event');
assertEqual(result1, null, 'Should return null for student with < 2 results');

// Test 2: Student with two consecutive low scores
const result2 = findConsecutiveLowScores({
  id: 'student-2',
  givenName: 'Bob',
  surname: 'Jones',
  slackId: 'U789',
  standupResults: [{ rating: 1 }, { rating: 1 }],
}, 'Test Event');
assert(result2 !== null, 'Should flag student with two consecutive scores of 1');
assert(result2?.givenName === 'Bob', 'Should preserve student name');
assert(result2?.lastTwoRatings[0] === 1 && result2?.lastTwoRatings[1] === 1, 'Should capture both ratings');

// Test 3: Student with one low, one acceptable
const result3 = findConsecutiveLowScores({
  id: 'student-3',
  givenName: 'Charlie',
  surname: 'Brown',
  slackId: null,
  standupResults: [{ rating: 1 }, { rating: 2 }],
}, 'Test Event');
assertEqual(result3, null, 'Should NOT flag student with 1 then 2');

// Test 4: Student with scores 2 or higher
const result4 = findConsecutiveLowScores({
  id: 'student-4',
  givenName: 'David',
  surname: 'Wilson',
  slackId: 'U456',
  standupResults: [{ rating: 2 }, { rating: 3 }],
}, 'Test Event');
assertEqual(result4, null, 'Should NOT flag student with all scores >= 2');

// Test 5: Consecutive low scores in the middle
const result5 = findConsecutiveLowScores({
  id: 'student-5',
  givenName: 'Emily',
  surname: 'Davis',
  slackId: 'U999',
  standupResults: [{ rating: 3 }, { rating: 1 }, { rating: 1 }, { rating: 3 }],
}, 'Test Event');
assert(result5 !== null, 'Should flag student with consecutive low scores in the middle');

// Test 6: Handle null ratings
const result6 = findConsecutiveLowScores({
  id: 'student-6',
  givenName: 'Frank',
  surname: 'Miller',
  slackId: null,
  standupResults: [{ rating: null }, { rating: 1 }, { rating: 1 }],
}, 'Test Event');
assert(result6 !== null, 'Should flag when consecutive low scores exist (ignoring nulls)');

// Test 7: Only null ratings
const result7 = findConsecutiveLowScores({
  id: 'student-7',
  givenName: 'Grace',
  surname: 'Lee',
  slackId: null,
  standupResults: [{ rating: null }, { rating: null }],
}, 'Test Event');
assertEqual(result7, null, 'Should NOT flag when only null ratings exist');

console.log('\n🧪 Testing formatStudentList...\n');

// Test 8: Format single student with Slack ID
const formatted1 = formatStudentList([{
  studentId: 'student-1',
  givenName: 'Alice',
  surname: 'Smith',
  slackId: 'U123456',
  eventName: 'Test Event',
  consecutiveLowScores: 2,
  lastTwoRatings: [1, 1],
}]);
assertEqual(formatted1, '• <@U123456> (Alice Smith)', 'Should format with Slack mention');

// Test 9: Format single student without Slack ID
const formatted2 = formatStudentList([{
  studentId: 'student-2',
  givenName: 'Bob',
  surname: 'Jones',
  slackId: null,
  eventName: 'Test Event',
  consecutiveLowScores: 2,
  lastTwoRatings: [0, 1],
}]);
assertEqual(formatted2, '• Bob Jones (Bob Jones)', 'Should format without Slack mention');

// Test 10: Format multiple students
const formatted3 = formatStudentList([
  {
    studentId: 'student-1',
    givenName: 'Alice',
    surname: 'Smith',
    slackId: 'U123',
    eventName: 'Test Event',
    consecutiveLowScores: 2,
    lastTwoRatings: [1, 1],
  },
  {
    studentId: 'student-2',
    givenName: 'Bob',
    surname: 'Jones',
    slackId: null,
    eventName: 'Test Event',
    consecutiveLowScores: 2,
    lastTwoRatings: [0, 1],
  },
]);
const expected = '• <@U123> (Alice Smith)\n• Bob Jones (Bob Jones)';
assertEqual(formatted3, expected, 'Should format multiple students with newlines');

console.log('\n✨ All tests passed!\n');
