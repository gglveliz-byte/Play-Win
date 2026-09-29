import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('sky\\script.js') || line.includes('sky/script.js')) {
    try {
      const data = JSON.parse(line);
      if (data.tool_calls) {
        for (const tc of data.tool_calls) {
          console.log('Tool Call in step', data.step_index, tc.name, tc.args?.TargetFile || tc.args?.AbsolutePath || '');
        }
      }
      if (data.type === 'WRITE_TO_FILE' || data.type === 'REPLACE_FILE_CONTENT' || data.type === 'MULTI_REPLACE_FILE_CONTENT') {
        console.log('File edit in step', data.step_index, data.type);
      }
    } catch (e) {}
  }
});
