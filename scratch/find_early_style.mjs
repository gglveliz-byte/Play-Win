import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('space/style.css') || line.includes('space\\\\style.css')) {
    try {
      const data = JSON.parse(line);
      if (data.step_index < 363) {
        console.log('Step < 363:', data.step_index, data.type);
        if (data.tool_calls) console.log(JSON.stringify(data.tool_calls));
        if (data.content) console.log('Content len:', data.content.length);
      }
    } catch (e) {}
  }
});
