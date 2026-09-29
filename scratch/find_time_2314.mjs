import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.created_at && data.created_at >= '2026-09-29T04:12:00Z' && data.created_at <= '2026-09-29T04:16:00Z') {
      if (data.tool_calls) {
        console.log(data.step_index, data.created_at, data.tool_calls.map(tc => `${tc.name}: ${tc.args?.TargetFile || tc.args?.CommandLine || ''}`));
      }
    }
  } catch (e) {}
});
