import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('.mobile-touch-panel') || line.includes('.btn-bomb') || line.includes('.hud-overlay')) {
    try {
      const data = JSON.parse(line);
      console.log('Match in step:', data.step_index, data.type);
      if (data.content && data.content.includes('{')) {
        fs.writeFileSync(`scratch/css_match_${data.step_index}.txt`, data.content);
        console.log(`Saved scratch/css_match_${data.step_index}.txt, len: ${data.content.length}`);
      }
    } catch (e) {}
  }
});
