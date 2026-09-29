import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('sky') && (line.includes('Copy-Item') || line.includes('cp ') || line.includes('copy') || line.includes('Move-Item') || line.includes('Set-Content') || line.includes('Out-File'))) {
    try {
      const data = JSON.parse(line);
      console.log('Step:', data.step_index);
      if (data.tool_calls) console.log('Tool calls:', JSON.stringify(data.tool_calls));
    } catch (e) {}
  }
});
