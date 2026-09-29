import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if ([15, 17, 18, 162, 184, 262, 344, 354].includes(data.step_index)) {
      console.log(`=== Step ${data.step_index} ===`);
      console.log(data.content?.slice(0, 300));
    }
  } catch (e) {}
});
