import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('sky/script.js') || line.includes('sky\\\\script.js')) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'VIEW_FILE' || (data.tool_calls && data.tool_calls.some(tc => tc.name === 'view_file'))) {
        console.log('Step:', data.step_index, 'type:', data.type);
        if (data.tool_calls) console.log('Args:', JSON.stringify(data.tool_calls[0].args));
        if (data.content) console.log('Content preview:', data.content.slice(0, 200));
      }
    } catch (e) {}
  }
});
