import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\396c930a-b94b-46b6-8702-ccde18a94a30\\.system_generated\\logs\\transcript_full.jsonl'),
  crlfDelay: Infinity
});

const chunks = [];
rl.on('line', (line) => {
  if (line.includes('sky/script.js') && line.includes('Showing lines')) {
    try {
      const data = JSON.parse(line);
      const content = data.content || '';
      console.log('Step:', data.step_index, 'Content length:', content.length);
      const match = content.match(/Showing lines (\d+) to (\d+)/);
      if (match) {
        console.log(`  Lines ${match[1]} to ${match[2]}`);
        chunks.push({
          step: data.step_index,
          start: parseInt(match[1]),
          end: parseInt(match[2]),
          content: content
        });
      }
    } catch (e) {
      console.error(e.message);
    }
  }
});

rl.on('close', () => {
  console.log('Total chunks found:', chunks.length);
  fs.writeFileSync('scratch/sky_chunks.json', JSON.stringify(chunks, null, 2));
});
