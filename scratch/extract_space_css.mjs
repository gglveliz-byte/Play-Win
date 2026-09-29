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
      if (data.type === 'VIEW_FILE' && data.content && data.content.includes('.hud-overlay')) {
        console.log('Found full style.css in step:', data.step_index);
        fs.writeFileSync('scratch/original_space_style.txt', data.content);
      }
    } catch (e) {}
  }
});
