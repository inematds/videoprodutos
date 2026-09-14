// Motores de vídeo por IA (clipe a partir de imagem). Plugável: agnes hoje; kie/outros entram aqui.
// Interface: generateClip({ image, prompt, seconds, w, h, out, log }) → caminho do MP4 ou lança erro.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from './config.js';

const run = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const toDataUri = f => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(f).toString('base64')}`;

async function probe(f) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'csv=p=0', f]);
  const [w, h, d] = stdout.trim().split(',');
  return { w: +w, h: +h, seconds: parseFloat(d) || 0 };
}

// ---------- Agnes (agnes-video-v2.0) ----------
let lastPost = 0;
const agnes = {
  name: 'agnes',
  minGapMs: 13000, // rate limit real: 5 req/min
  async generateClip({ image, imageB, prompt, seconds, w, h, out, log }) {
    const cfg = loadConfig();
    if (!cfg.AGNES_API_KEY) throw new Error('AGNES_API_KEY vazio');
    const base = cfg.AGNES_BASE_URL.replace(/\/$/, '');
    const fps = 24;
    // num_frames: regra 8n+1, teto 441 (18,4 s) — 720p é o tier seguro
    const frames = Math.min(441, Math.max(25, Math.round(seconds * fps / 8) * 8 + 1));
    const wide = w >= h;
    const body = {
      model: cfg.AGNES_VIDEO_MODEL || 'agnes-video-v2.0',
      prompt: `${prompt}. The product stays perfectly still, sharp and unchanged; only the camera and light move. Photorealistic advertising footage, no text, no people, no extra objects.`,
      negative_prompt: 'text, watermark, logo, people, hands, deformed product, extra objects, flicker',
      num_frames: frames, frame_rate: fps,
      width: wide ? 1280 : 720, height: wide ? 720 : 1280,
      seed: 7,
      extra_body: imageB ? { image: [toDataUri(image), toDataUri(imageB)], mode: 'keyframes' } : { image: [toDataUri(image)] },
    };
    // POST com throttle + retry (429 espera 65 s; 503/timeout backoff)
    let id = null;
    for (let t = 1; t <= 5 && !id; t++) {
      const wait = lastPost + this.minGapMs - Date.now(); if (wait > 0) await sleep(wait);
      lastPost = Date.now();
      try {
        const r = await fetch(`${base}/videos`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.AGNES_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
        if (r.status === 429) { log('agnes vídeo: rate limit — esperando 65 s'); await sleep(65000); continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
        const j = await r.json(); id = j.video_id || j.task_id || j.id;
      } catch (e) { log(`agnes vídeo: tentativa ${t} falhou (${e.message.slice(0, 80)})`); await sleep(6000 * t); }
    }
    if (!id) throw new Error('agnes não aceitou o job');
    // poll até 12 min (engasgos de minutos são normais)
    const t0 = Date.now(); let url = null;
    while (Date.now() - t0 < 12 * 60000) {
      await sleep(8000);
      try {
        const r = await fetch(`${base.replace(/\/v1$/, '')}/agnesapi?video_id=${id}`, { headers: { authorization: `Bearer ${cfg.AGNES_API_KEY}` }, signal: AbortSignal.timeout(60000) });
        const j = await r.json();
        if (j.status === 'completed') { url = j.url || j.data?.[0]?.url || j.video_url; break; }
        if (j.status === 'failed') throw new Error(`agnes falhou: ${JSON.stringify(j).slice(0, 120)}`);
      } catch (e) { if (/agnes falhou/.test(e.message)) throw e; }
    }
    if (!url) throw new Error('agnes: timeout esperando o clipe');
    const raw = out + '.raw.mp4';
    fs.writeFileSync(raw, Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(300000) })).arrayBuffer()));
    const p = await probe(raw);
    if (!p.seconds) throw new Error('agnes: clipe vazio');
    log(`agnes vídeo: clipe ${p.w}x${p.h} ${p.seconds.toFixed(1)}s em ${Math.round((Date.now() - t0) / 1000)}s`);
    return raw;
  },
};

// ---------- kie.ai (esqueleto — trocar aqui quando migrar) ----------
const kie = {
  name: 'kie',
  async generateClip() { throw new Error('motor kie ainda não implementado — configure VIDEO_ENGINE=agnes ou ffmpeg'); },
};

export const ENGINES = { agnes, kie };

/** Gera um clipe já normalizado para WxH, 30 fps e duração exata `seconds` (loop/trim). null se motor = ffmpeg. */
export async function aiClip({ image, prompt, seconds, w, h, out, log = () => {} }) {
  const cfg = loadConfig();
  const eng = ENGINES[cfg.VIDEO_ENGINE];
  if (!eng) return null;
  // keyframes A→A: começa e termina na foto exata — segura o produto (imagem única reinventa rótulos/embalagem)
  const raw = await eng.generateClip({ image, imageB: image, prompt, seconds, w, h, out, log });
  const p = await probe(raw);
  // normaliza: cobre o quadro, centraliza, ajusta fps; se o clipe for curto, faz ping-pong para preencher
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30`;
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (p.seconds < seconds - 0.2) args.push('-stream_loop', '1');
  args.push('-i', raw, '-vf', vf, '-t', String(seconds), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out);
  await run('ffmpeg', args, { timeout: 300000 });
  fs.unlinkSync(raw);
  return out;
}
