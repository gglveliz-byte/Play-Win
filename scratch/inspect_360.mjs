import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.step_index >= 360 && data.step_index <= 366) {
      console.log('Step:', data.step_index, data.type);
      if (data.tool_calls) console.log('Tool calls:', JSON.stringify(data.tool_calls, null, 2));
    }
  } catch (e) {}
});
