// Vídeo promocional por produto — ffmpeg puro (zoompan, xfade, overlays SVG→PNG, grade por estilo), 16:9 e 9:16.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { loadConfig } from './config.js';
import { VIDEO_STYLES, IMAGE_PRESETS } from './presets.js';
import { FONT, esc, FORMATS, wrapText, tspans } from './image.js';
import { getMusic, narrate, duration } from './audio.js';
import { aiClip } from './videoai.js';

const runRaw = promisify(execFile);
const FPS = 30;
// ffmpeg com proteção: 1 retry; se falhar com nvenc (sessão/VRAM ocupada), refaz com libx264
async function run(cmd, args, opts = {}) {
  try { return await runRaw(cmd, args, opts); }
  catch (e1) {
    const i = args.indexOf('h264_nvenc');
    if (cmd === 'ffmpeg' && i > 0) {
      const a2 = [...args]; a2.splice(i - 1, 12, ...encArgs('libx264'));
      try { return await runRaw(cmd, a2, opts); } catch (e2) { throw new Error(`${e2.message.split('\n').filter(Boolean).slice(-2).join(' | ')}`); }
    }
    try { return await runRaw(cmd, args, opts); } catch (e2) { throw new Error(`${e2.message.split('\n').filter(Boolean).slice(-2).join(' | ')}`); }
  }
}
let encoderCache = null;

async function pickEncoder() {
  const cfg = loadConfig();
  if (cfg.ENCODER !== 'auto') return cfg.ENCODER;
  if (encoderCache) return encoderCache;
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'], { timeout: 20000 });
    encoderCache = 'h264_nvenc';
  } catch { encoderCache = 'libx264'; }
  return encoderCache;
}
const encArgs = enc => enc === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-pix_fmt', 'yuv420p'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p'];

const GRADES = {
  pop: 'eq=contrast=1.08:saturation=1.18',
  soft: 'eq=contrast=0.98:brightness=0.015:saturation=0.98,vignette=PI/5',
  cool: 'colorbalance=bs=0.10:bm=0.04:bh=0.05,eq=contrast=1.05,rgbashift=rh=2:bh=-2',
  warm: 'colorbalance=rs=0.08:gs=0.02:bs=-0.08:rm=0.04,eq=saturation=1.05',
  cinema: 'eq=contrast=1.12:saturation=0.9,vignette=PI/4.2',
};

function zoomExpr(kind, frames, tall) {
  const step = (0.18 / frames).toFixed(6);
  switch (kind) {
    case 'punch': return { z: `if(eq(on,1),1.22,max(zoom-${(0.22 / (frames * 0.55)).toFixed(6)},1.0))`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
    case 'drift': return { z: `1.12+${(0.06 / frames).toFixed(6)}*on`, x: `(iw-iw/zoom)*(on/${frames})`, y: tall ? `(ih-ih/zoom)*0.4` : 'ih/2-(ih/zoom/2)' };
    default: return { z: `min(1.0+${step}*on,1.2)`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
  }
}

async function textPng({ w, h, kind, copy, preset, brand }, dst) {
  const P = IMAGE_PRESETS[preset] || IMAGE_PRESETS['dark-premium'];
  const tall = h > w; const cx = w / 2;
  const fit = (s, max) => { s = String(s || ''); return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; };
  const stroke = `style="paint-order:stroke" stroke="rgba(0,0,0,0.45)" stroke-width="{sw}"`;
  let body = '';
  const band = (y, hh) => `<rect x="0" y="${y}" width="${w}" height="${hh}" fill="#000" fill-opacity="0.28"/>`;
  if (kind === 'intro') {
    const hl = wrapText(copy.headline, tall ? 16 : 24);
    const fs1 = Math.round((tall ? w : h) * 0.085 * hl.scale), fs2 = Math.round(fs1 * 0.45);
    const y = (tall ? h * 0.78 : h * 0.84) - (hl.lines.length - 1) * fs1 * 1.05;
    body = `${band(y - fs1 * 1.2, fs1 * 2.6 + (hl.lines.length - 1) * fs1 * 1.05)}<text font-family="${FONT}" font-weight="800" font-size="${fs1}" fill="#fff" text-anchor="middle" ${stroke.replace('{sw}', Math.round(fs1 * 0.09))}>${tspans(hl.lines, cx, y, fs1 * 1.05)}</text>
      <text x="${cx}" y="${y + (hl.lines.length - 1) * fs1 * 1.05 + fs2 * 1.6}" font-family="${FONT}" font-weight="600" font-size="${fs2}" fill="${P.accent}" text-anchor="middle" ${stroke.replace('{sw}', Math.round(fs2 * 0.08))}>${esc(fit(copy.tagline, tall ? 30 : 48))}</text>`;
  } else if (kind === 'benefit') {
    const label = String(copy.text || '').trim(); const maxC = tall ? 20 : 30;
    const fs1 = Math.round((tall ? w : h) * 0.07 * Math.min(1, maxC / Math.max(1, label.length)));
    const y = tall ? h * 0.8 : h * 0.86;
    const bw = Math.min(w * 0.9, label.length * fs1 * 0.62 + fs1 * 1.6);
    body = `<rect x="${cx - bw / 2}" y="${y - fs1 * 1.05}" width="${bw}" height="${fs1 * 1.55}" rx="${fs1 * 0.35}" fill="${P.accent}" fill-opacity="0.92"/>
      <text x="${cx}" y="${y + fs1 * 0.08}" font-family="${FONT}" font-weight="800" font-size="${fs1}" fill="${P.accent === '#ffffff' ? '#111' : (P.text === '#ffffff' ? '#111' : '#fff')}" text-anchor="middle">${esc(label)}</text>`;
  } else if (kind === 'outro') {
    const ctaTxt = String(copy.cta || '').trim(); const maxC = tall ? 16 : 24;
    const fs1 = Math.round((tall ? w : h) * 0.09 * Math.min(1, maxC / Math.max(1, ctaTxt.length))), fs2 = Math.round((tall ? w : h) * 0.09 * 0.42), fsP = Math.round((tall ? w : h) * 0.09 * 0.62);
    const y = tall ? h * 0.8 : h * 0.84;
    const price = copy.price ? `<rect x="${cx - fsP * 3.4}" y="${y - fs1 * 1.2 - fsP * 1.7}" width="${fsP * 6.8}" height="${fsP * 1.5}" rx="${fsP * 0.75}" fill="${P.accent}"/><text x="${cx}" y="${y - fs1 * 1.2 - fsP * 0.62}" font-family="${FONT}" font-weight="800" font-size="${fsP}" fill="${P.accent === '#ffffff' ? '#111' : '#1a1207'}" text-anchor="middle">${esc(copy.price)}</text>` : '';
    body = `${band(y - fs1 * 1.25, fs1 * 2.4)}${price}<text x="${cx}" y="${y}" font-family="${FONT}" font-weight="800" font-size="${fs1}" fill="#fff" text-anchor="middle" ${stroke.replace('{sw}', Math.round(fs1 * 0.09))}>${esc(ctaTxt)}</text>
      ${brand ? `<text x="${cx}" y="${y + fs2 * 1.7}" font-family="${FONT}" font-weight="600" font-size="${fs2}" fill="${P.accent}" text-anchor="middle" letter-spacing="2">${esc(fit(brand, 40))}</text>` : ''}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(dst);
  return dst;
}

const CAMERA_PROMPTS = { punch: 'dynamic camera push-in toward the product with a subtle parallax', slow: 'slow elegant dolly-in on the product', drift: 'slow lateral camera drift around the product with soft light sweep' };

async function renderScene({ img, textPng: tp, seconds, w, h, zoom, grade, enc, out, ai, log = () => {} }) {
  const frames = Math.round(seconds * FPS);
  let clip = null;
  if (ai) {
    try { clip = await aiClip({ image: img, prompt: CAMERA_PROMPTS[zoom] || CAMERA_PROMPTS.slow, seconds, w, h, out: out.replace(/\.mp4$/, '-ia.mp4'), log }); }
    catch (e) { log(`clipe IA falhou (${e.message.slice(0, 90)}) — cena no ffmpeg`); }
  }
  const z = zoomExpr(zoom, frames, h > w);
  const up = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2}`;
  const chain = [clip ? `[0:v]${GRADES[grade] || GRADES.pop},format=yuv420p[base]` : `[0:v]${up},zoompan=z='${z.z}':x='${z.x}':y='${z.y}':d=${frames}:s=${w}x${h}:fps=${FPS},${GRADES[grade] || GRADES.pop},format=yuv420p[base]`];
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', clip || img];
  let last = '[base]';
  if (tp) {
    args.push('-loop', '1', '-t', String(seconds), '-i', tp);
    chain.push(`[1:v]format=rgba,fade=t=in:st=0.25:d=0.45:alpha=1,fade=t=out:st=${(seconds - 0.4).toFixed(2)}:d=0.35:alpha=1[t]`, `[base][t]overlay=0:0:shortest=1[v]`);
    last = '[v]';
  }
  args.push('-filter_complex', chain.join(';'), '-map', last, '-t', String(seconds), '-r', String(FPS), ...encArgs(enc), '-an', out);
  await run('ffmpeg', args, { timeout: 300000, maxBuffer: 1 << 24 });
  return out;
}

async function concatWithXfade(scenes, secs, transition, xfade, enc, out) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const s of scenes) args.push('-i', s);
  if (scenes.length === 1) { fs.copyFileSync(scenes[0], out); return secs[0]; }
  const parts = []; let prev = '[0:v]'; let offset = 0;
  for (let i = 1; i < scenes.length; i++) {
    offset += secs[i - 1] - xfade;
    const lbl = i === scenes.length - 1 ? '[v]' : `[x${i}]`;
    parts.push(`${prev}[${i}:v]xfade=transition=${transition}:duration=${xfade}:offset=${offset.toFixed(3)}${lbl}`);
    prev = lbl;
  }
  args.push('-filter_complex', parts.join(';'), '-map', '[v]', ...encArgs(enc), '-an', out);
  await run('ffmpeg', args, { timeout: 600000, maxBuffer: 1 << 24 });
  return secs.reduce((a, b) => a + b, 0) - xfade * (scenes.length - 1);
}

async function mux({ video, music, voice, total, out, musicCredit }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', video];
  const f = []; const inputs = [];
  if (music) { args.push('-stream_loop', '-1', '-i', music); inputs.push(`[${inputs.length + 1}:a]atrim=0:${total.toFixed(2)},asetpts=PTS-STARTPTS,volume=${voice ? 0.16 : 0.42},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, total - 1.8).toFixed(2)}:d=1.8[m]`); }
  if (voice) { args.push('-i', voice); inputs.push(`[${inputs.length + 1}:a]adelay=700|700,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)}[n]`); }
  if (!inputs.length) { fs.copyFileSync(video, out); return; }
  const labels = (music ? '[m]' : '') + (voice ? '[n]' : '');
  f.push(...inputs, `${labels}amix=inputs=${inputs.length}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  args.push('-filter_complex', f.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart');
  if (musicCredit) args.push('-metadata', `comment=Música: ${musicCredit}`);
  args.push(out);
  await run('ffmpeg', args, { timeout: 300000, maxBuffer: 1 << 24 });
}

/** Renderiza os vídeos (wide+tall) de um produto. images = resultado de renderProductImages */
export async function renderProductVideo({ product, copy, images, style, formats = ['wide', 'tall'], outDir, workDir, log = () => {}, brand }) {
  const S = VIDEO_STYLES[style]; if (!S) throw new Error(`estilo desconhecido: ${style}`);
  fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(workDir, { recursive: true });
  const enc = await pickEncoder();
  const music = await getMusic(style, S.music, log);
  const cfg = loadConfig();
  const aiScenes = cfg.VIDEO_ENGINE && cfg.VIDEO_ENGINE !== 'ffmpeg' ? (parseInt(cfg.AI_SCENES, 10) || 99) : 0;
  if (aiScenes) log(`motor de vídeo: ${cfg.VIDEO_ENGINE} (${aiScenes >= 99 ? 'todas as' : aiScenes} cenas por IA)`);
  let voice = null;
  if (cfg.TTS_ENGINE !== 'none') {
    const text = `${copy.headline}. ${copy.tagline}. ${copy.benefits.join('. ')}. ${copy.cta}${brand ? ', ' + brand : ''}.`;
    voice = await narrate(text, path.join(workDir, `${product.id}-voz.wav`), log);
  }
  const voiceDur = voice ? await duration(voice) : 0;
  const results = {};
  for (const fmt of formats) {
    const [w, h] = FORMATS[fmt];
    // roteiro de cenas: intro → 1 benefício por cena (alternando shots) → outro com preço/CTA
    const shots = images.shots.map(s => s[fmt]);
    const scenes = [
      { img: shots[0], kind: 'intro', zoom: S.zoom, sec: S.shot + 0.6 },
      ...copy.benefits.map((b, i) => ({ img: shots[(i + 1) % shots.length], kind: 'benefit', text: b, zoom: i % 2 ? (S.zoom === 'punch' ? 'slow' : 'punch') : S.zoom, sec: S.shot })),
      { img: images.clean[fmt], kind: 'outro', zoom: 'slow', sec: S.shot + 1.0 },
    ];
    // se a narração for mais longa que o vídeo, estica as cenas proporcionalmente
    let total = scenes.reduce((a, s) => a + s.sec, 0) - S.xfade * (scenes.length - 1);
    if (voiceDur + 1.5 > total) { const k = (voiceDur + 1.5) / total; scenes.forEach(s => s.sec *= k); }
    const files = [], secs = [];
    for (const [i, sc] of scenes.entries()) {
      const tp = path.join(workDir, `${product.id}-${fmt}-t${i}.png`);
      await textPng({ w, h, kind: sc.kind, copy: sc.kind === 'benefit' ? { text: sc.text } : copy, preset: images.preset, brand }, tp);
      const f = path.join(workDir, `${product.id}-${fmt}-s${i}.mp4`);
      await renderScene({ img: sc.img, textPng: tp, seconds: sc.sec, w, h, zoom: sc.zoom, grade: S.grade, enc, out: f, ai: i < aiScenes, log });
      files.push(f); secs.push(sc.sec);
    }
    const silent = path.join(workDir, `${product.id}-${fmt}-mudo.mp4`);
    total = await concatWithXfade(files, secs, S.transition, S.xfade, enc, silent);
    const out = path.join(outDir, `${product.id}-${style}-${fmt === 'wide' ? '16x9' : '9x16'}.mp4`);
    await mux({ video: silent, music: music?.path, voice, total, out, musicCredit: music?.credit ? `${music.credit.name} — ${music.credit.author} (CC0, Freesound)` : (music?.synth ? 'trilha sintética local' : '') });
    const poster = out.replace(/\.mp4$/, '.jpg');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', (total * 0.35).toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '3', poster]);
    results[fmt] = { file: out, poster, seconds: Math.round(total * 10) / 10 };
    log(`vídeo ${fmt === 'wide' ? '16:9' : '9:16'}: ${path.basename(out)} (${results[fmt].seconds}s, ${enc})`);
  }
  return { style, encoder: enc, engine: aiScenes ? cfg.VIDEO_ENGINE : 'ffmpeg', music: music?.credit || (music?.synth ? { name: 'trilha sintética local' } : null), voice: !!voice, formats: results };
}

/** Junta os vídeos de vários produtos numa compilação (mesmo formato). */
export async function compile(files, out) {
  if (files.length < 2) return null;
  const list = out + '.txt';
  fs.writeFileSync(list, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { timeout: 300000 });
  fs.unlinkSync(list);
  return out;
}
