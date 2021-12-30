import { sampleData } from './matchingData';
import {
  step1, step2, step3,
} from './findMatching';
import { MatchingStats, unassignedStudentProjects } from './matchingHelpers';

step1(sampleData);
console.log(MatchingStats(sampleData));
step2(sampleData);
console.log(MatchingStats(sampleData));
step3(sampleData, 3, 19, 20);
console.log(MatchingStats(sampleData));
const thing = unassignedStudentProjects(sampleData);
console.log("breakpoint");
