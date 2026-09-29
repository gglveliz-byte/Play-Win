import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.step_index >= 368 && data.step_index <= 385) {
      console.log(`=== Step ${data.step_index} (${data.type}) ===`);
      if (data.tool_calls) {
        for (const tc of data.tool_calls) {
          console.log(` Tool: ${tc.name}`, tc.args?.TargetFile || tc.args?.AbsolutePath || tc.args?.CommandLine || '');
        }
      }
      if (data.thinking) {
        console.log(' Thinking:', data.thinking.slice(0, 150) + '...');
      }
    }
  } catch (e) {}
});
