#!/usr/bin/env node
// CLI: node cli.js <pasta|url> [--preset X] [--estilo Y] [--formato wide|tall|ambos] [--max N] [--sem-video] [--marca "Nome"]
//      node cli.js --lote arquivo.txt   (uma fonte por linha: "fonte | preset | estilo | formato")
import fs from 'node:fs';
import { ensureDirs } from './lib/config.js';
import { runJob, makeId, nameFor, newJobFromLine } from './lib/pipeline.js';
import { IMAGE_PRESETS, VIDEO_STYLES } from './lib/presets.js';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!args.length || args.includes('--help')) {
  console.log(`uso: node cli.js <pasta|url> [--preset ${Object.keys(IMAGE_PRESETS).join('|')}|auto] [--estilo ${Object.keys(VIDEO_STYLES).join('|')}|auto] [--formato wide|tall|ambos] [--max N] [--sem-video] [--marca "Nome"]\n     node cli.js --lote lista.txt`);
  process.exit(0);
}
ensureDirs();
const jobs = [];
if (get('--lote')) {
  for (const line of fs.readFileSync(get('--lote'), 'utf8').split(/\r?\n/)) { const j = newJobFromLine(line.trim()); if (j && !line.trim().startsWith('#')) jobs.push(j); }
} else {
  const fmt = get('--formato', 'ambos');
  jobs.push({ source: args[0], options: { preset: get('--preset', 'auto'), style: get('--estilo', 'auto'), formats: fmt === 'ambos' ? ['wide', 'tall'] : [fmt], max: get('--max') ? parseInt(get('--max'), 10) : undefined, video: !args.includes('--sem-video'), brand: get('--marca') } });
}
for (const j of jobs) {
  const job = { id: makeId(j.source), name: nameFor(j.source), source: j.source, options: j.options, log: [] };
  console.log(`\n=== ${job.name} (${job.id}) ===`);
  try {
    const m = await runJob(job, { log: l => console.log('  ' + l), progress: (p, s) => console.log(`  [${String(p).padStart(3)}%] ${s}`), isCancelled: () => false });
    console.log(`✔ projeto: ${m.dir}`);
  } catch (e) { console.error(`✖ ${e.message}`); process.exitCode = 1; }
}
