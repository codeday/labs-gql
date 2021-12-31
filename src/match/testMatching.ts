import { generateReliableMatch } from './findMatching';
import { sampleData } from './matchingData';

const { stats } = generateReliableMatch(sampleData);
console.log(stats);
