/**
 * Offline unit tests for the mentor recommendations CSV serializer. No live DB,
 * OpenAI, or Slack access — only the pure buildRecommendationsCsv function is
 * exercised, with csv-parse used to round-trip the output.
 *
 * Run with:
 *   npx ts-node src/activities/tasks/mentorWriteRecommendations.test.ts
 */
import 'reflect-metadata';
import { parse } from 'csv-parse/sync';
import { buildRecommendationsCsv } from './mentorWriteRecommendations';

let failures = 0;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAILED: ${message}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

const EXPECTED_COLUMNS = [
  'mentor', 'linkedIn', 'Recommendation For', 'Pronouns',
  'Count of Projects Mentored', 'Students Mentored', 'Count of Students Mentored',
  'Mentorship Dates', 'What Students Had to Say', 'prompt', 'result',
];

// Mirrors the per-mentor `mentorInformation` shape built by the task, including the
// conditional `What Students Had to Say` key that creates heterogeneous records.
type MentorRecord = Record<string, string | number>;

function baseRecord(overrides: Partial<MentorRecord>): MentorRecord {
  return {
    mentor: 'Mentor A',
    linkedIn: 'LA',
    'Recommendation For': 'Mentor A',
    Pronouns: 'they/them',
    'Count of Projects Mentored': 1,
    'Students Mentored': 'Alice',
    'Count of Students Mentored': 1,
    'Mentorship Dates': 'Jan 1, 2024-Feb 5, 2024',
    prompt: 'prompt text',
    result: 'recommendation text',
    ...overrides,
  };
}

function recordWithFeedback(feedback: string): MentorRecord {
  return baseRecord({
    mentor: 'Mentor B',
    linkedIn: 'LB',
    'Recommendation For': 'Mentor B',
    'What Students Had to Say': `\n` + feedback,
    prompt: `prompt text\nWhat Students Had to Say:\n` + feedback,
    result: 'rec B',
  });
}

function parseRows(csv: string): Record<string, string>[] {
  return parse(csv, { columns: true, relax_quotes: true, relax_column_count: true }) as Record<string, string>[];
}

// The header is pinned by an explicit `columns` list, so it no longer depends on the
// keys present in the first record. When the first-returned mentor has no qualifying
// feedback (key absent), the `What Students Had to Say` column must still be emitted.
(function testHeaderIsPinnedRegardlessOfFirstRecordShape() {
  const records = [
    baseRecord({}),
    recordWithFeedback('- q: They were wonderful and very supportive throughout.'),
  ];
  const csv = buildRecommendationsCsv(records);
  const headerLine = csv.split('\n', 1)[0];
  assertEqual(headerLine.split(','), EXPECTED_COLUMNS, 'Header is the pinned column list even when the first record lacks What Students Had to Say');
})();

// The original bug: with the column dropped, a later mentor's feedback only survived
// inside the multi-line `prompt` cell. The fix gives it a dedicated, header-addressable
// cell while feedback-less mentors get an empty cell.
(function testFeedbackCellPreservedWhenFirstRecordLacksKey() {
  const feedback = '- q: They were wonderful and very supportive throughout.';
  const records = [
    baseRecord({}),
    recordWithFeedback(feedback),
  ];
  const csv = buildRecommendationsCsv(records);
  const rows = parseRows(csv);
  assertEqual(rows[0]['What Students Had to Say'], '', 'Feedback-less first mentor gets an empty dedicated cell');
  assertEqual(rows[1]['What Students Had to Say'], `\n` + feedback, "Later mentor's feedback lands in its own dedicated cell, not just embedded in prompt");
})();

// Real feedback blobs are multi-line and comma-laden; the dedicated cell must round-trip
// intact through csv-parse so downstream consumers can read it by header name.
(function testMultilineFeedbackRoundTripsInDedicatedCell() {
  const feedback = [
    '- q1: They were wonderful and very supportive throughout.',
    '- q2: Patient, knowledgeable, and always available when we needed help.',
    '- q3: One of the best mentors I have worked with, highly recommend.',
  ].join('\n');
  const records = [
    baseRecord({}),
    recordWithFeedback(feedback),
  ];
  const csv = buildRecommendationsCsv(records);
  const rows = parseRows(csv);
  assertEqual(rows[1]['What Students Had to Say'], `\n` + feedback, 'Multi-line feedback survives CSV round-trip in its dedicated, header-addressable cell');
  assertEqual(rows[1].mentor, 'Mentor B', 'Non-feedback columns still parse correctly alongside the feedback cell');
})();

// Pinning columns must not drop or reorder the unconditional fields, including the
// GPT `result` deliverable and comma-bearing `Students Mentored` values.
(function testUnconditionalColumnsRemainCorrect() {
  const records = [
    baseRecord({
      mentor: 'Mentor A',
      linkedIn: 'https://linkedin.com/in/a',
      'Recommendation For': 'Mentor A',
      Pronouns: 'she/her',
      'Count of Projects Mentored': 2,
      'Students Mentored': 'Alice, Bob',
      'Count of Students Mentored': 2,
      'Mentorship Dates': 'Jan 1, 2024-Feb 5, 2024, Sep 1, 2024-Oct 5, 2024',
      prompt: 'the prompt',
      result: 'the recommendation',
    }),
  ];
  const csv = buildRecommendationsCsv(records);
  const rows = parseRows(csv);
  assertEqual(rows[0].mentor, 'Mentor A', 'mentor column preserved');
  assertEqual(rows[0].linkedIn, 'https://linkedin.com/in/a', 'linkedIn column preserved');
  assertEqual(rows[0]['Count of Projects Mentored'], '2', 'Count of Projects Mentored preserved');
  assertEqual(rows[0]['Students Mentored'], 'Alice, Bob', 'Students Mentored preserves embedded comma via CSV quoting');
  assertEqual(rows[0].result, 'the recommendation', 'GPT result column preserved');
})();

async function main(): Promise<void> {
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
