import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('space/index.html') || line.includes('space/style.css') || line.includes('space\\\\index.html')) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'VIEW_FILE') {
        console.log('VIEW_FILE Step:', data.step_index, 'len:', data.content?.length);
        if (data.content && data.content.includes('<!DOCTYPE html>')) {
          fs.writeFileSync(`scratch/space_html_step_${data.step_index}.txt`, data.content);
          console.log(`Saved scratch/space_html_step_${data.step_index}.txt`);
        }
        if (data.content && (data.content.includes('.ui-screen') || data.content.includes('#game_hud') || data.content.includes('btn_shoot'))) {
          fs.writeFileSync(`scratch/space_css_step_${data.step_index}.txt`, data.content);
          console.log(`Saved scratch/space_css_step_${data.step_index}.txt`);
        }
      }
    } catch (e) {}
  }
});
