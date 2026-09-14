// Música (Freesound CC0 via inemavox, cache por estilo) + trilha sintética de fallback + narração TTS opcional.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, CACHE_DIR } from './config.js';

const run = promisify(execFile);
const musicDir = path.join(CACHE_DIR, 'music');

async function synthMusic(style, dst, seconds = 40) {
  // Trilha sintética simples: acorde em camadas com LFO e batida suave — sem dependência externa
  const bpm = { dinamico: 124, promo: 118, tech: 110, elegante: 72, natural: 88, cinematico: 66 }[style] || 100;
  const beat = 60 / bpm;
  const root = { dinamico: 220, promo: 196, tech: 164.8, elegante: 174.6, natural: 196, cinematico: 130.8 }[style] || 196;
  const f = [root, root * 1.25, root * 1.5, root * 2];
  const pad = f.map((hz, i) => `sine=frequency=${hz.toFixed(2)}:duration=${seconds}[p${i}]`).join(';');
  const mix = f.map((_, i) => `[p${i}]`).join('');
  const filter = `${pad};${mix}amix=inputs=${f.length}:normalize=0,volume=0.25,tremolo=f=${(1 / (beat * 2)).toFixed(3)}:d=0.35,lowpass=f=1800,aecho=0.6:0.3:${Math.round(beat * 1000)}:0.25[pad];` +
    `anoisesrc=color=brown:duration=${seconds}:amplitude=0.05,lowpass=f=120,tremolo=f=${(1 / beat).toFixed(3)}:d=0.9[kick];[pad][kick]amix=inputs=2:normalize=0,afade=t=in:d=1.5,afade=t=out:st=${seconds - 2}:d=2`;
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex', filter, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-q:a', '4', dst], { timeout: 120000 });
  return dst;
}

export async function getMusic(style, query, log = () => {}) {
  const cfg = loadConfig();
  fs.mkdirSync(musicDir, { recursive: true });
  const cached = path.join(musicDir, `${style}.mp3`);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 20000) {
    let credit = null; try { credit = JSON.parse(fs.readFileSync(cached + '.json', 'utf8')); } catch {}
    log(credit ? `música (cache): "${credit.name}" (${credit.author}, Freesound)` : 'música (cache): trilha sintética local');
    return { path: cached, cached: true, credit, synth: !credit };
  }
  if (cfg.MUSIC === 'none') return null;
  if (cfg.MUSIC === 'freesound') {
    const generic = { dinamico: 'upbeat pop', promo: 'upbeat corporate', tech: 'electronic ambient', elegante: 'piano ambient', natural: 'acoustic guitar', cinematico: 'cinematic orchestral' }[style] || 'background music';
    const attempts = [[query, 'cc0'], [generic, 'cc0'], [query, ''], [generic, ''], ['background music loop', '']];
    for (const [q, lic] of attempts) {
      try {
        const r = await fetch(`${cfg.INEMAVOX_URL}/api/audio/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, kind: 'music', min_duration: 20, max_duration: 180, per_page: 5, license_filter: lic, sort: 'rating' }), signal: AbortSignal.timeout(40000) });
        const j = await r.json();
        const hit = (j.results || []).find(h => h.preview_url);
        if (!hit) continue;
        const d = await fetch(`${cfg.INEMAVOX_URL}/api/audio/download`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...hit, kind: 'music' }), signal: AbortSignal.timeout(90000) });
        const dj = await d.json();
        if (!dj.ok) continue;
        // o path vem relativo à pasta do inemavox; tenta local, senão baixa pelo endpoint /api/audio/file
        const candidates = [dj.path, path.join(process.env.HOME, 'projetos', 'inemavox', dj.relative_path || dj.path)];
        const local = candidates.find(c => c && fs.existsSync(c));
        if (local) fs.copyFileSync(local, cached);
        else {
          const abs = candidates[1];
          const f = await fetch(`${cfg.INEMAVOX_URL}/api/audio/file?path=${encodeURIComponent(abs)}`, { signal: AbortSignal.timeout(90000) });
          if (!f.ok) continue;
          fs.writeFileSync(cached, Buffer.from(await f.arrayBuffer()));
        }
        if (fs.existsSync(cached) && fs.statSync(cached).size > 20000) {
          fs.writeFileSync(cached + '.json', JSON.stringify({ name: hit.name, author: hit.author, license: hit.license, page: hit.page_url, query: q }, null, 2));
          log(`música: "${hit.name}" (${hit.author}, Freesound, ${/zero/.test(hit.license) ? 'CC0' : 'CC-BY'})`);
          return { path: cached, credit: hit };
        }
      } catch (e) { log(`música: inemavox indisponível (${e.message}) — trilha sintética`); break; }
    }
    log('música: Freesound sem resultado — trilha sintética');
  }
  await synthMusic(style, cached);
  log('música: trilha sintética local');
  return { path: cached, synth: true };
}

export async function narrate(text, dst, log = () => {}) {
  const cfg = loadConfig();
  if (cfg.TTS_ENGINE === 'none' || !text) return null;
  try {
    const body = { text, engine: cfg.TTS_ENGINE, lang: 'pt', voice: cfg.TTS_VOICE };
    const r = await fetch(`${cfg.INEMAVOX_URL}/api/jobs/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const job = await r.json(); const id = job.job_id || job.id;
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise(res => setTimeout(res, 2000));
      const s = await (await fetch(`${cfg.INEMAVOX_URL}/api/jobs/${id}`)).json();
      if (s.status === 'completed') break;
      if (s.status === 'failed' || s.status === 'error') throw new Error(s.error || 'job falhou');
    }
    const a = await fetch(`${cfg.INEMAVOX_URL}/api/jobs/${id}/audio`);
    if (!a.ok) throw new Error(`áudio HTTP ${a.status}`);
    const buf = Buffer.from(await a.arrayBuffer());
    const raw = dst.replace(/\.\w+$/, '.raw' + ((a.headers.get('content-type') || '').includes('mp3') ? '.mp3' : '.wav'));
    fs.writeFileSync(raw, buf);
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-ac', '2', dst], { timeout: 60000 });
    fs.unlinkSync(raw);
    log(`narração: ${cfg.TTS_ENGINE}/${cfg.TTS_VOICE}`);
    return dst;
  } catch (e) { log(`narração indisponível (${e.message}) — vídeo sem voz`); return null; }
}

export async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(stdout) || 0;
}
