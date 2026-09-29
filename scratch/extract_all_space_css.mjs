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
      console.log('Step:', data.step_index, 'type:', data.type, 'content len:', data.content?.length);
      if (data.type === 'VIEW_FILE' && data.content) {
        fs.writeFileSync(`scratch/space_style_${data.step_index}.txt`, data.content);
      }
    } catch (e) {}
  }
});
