// videoprodutos — servidor web: UI + API da fila + projetos + configurações.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, publicConfig, SCHEMA, ensureDirs, ROOT } from './lib/config.js';
import { Queue } from './lib/queue.js';
import { IMAGE_PRESETS, VIDEO_STYLES, CATEGORIES } from './lib/presets.js';
import { newJobFromLine } from './lib/pipeline.js';

ensureDirs();
const cfg = loadConfig();
const app = express();
const queue = new Queue();
// senha opcional (APP_PASSWORD) — HTTP Basic, obrigatória quando exposto na internet
app.use((req, res, next) => {
  const pw = loadConfig().APP_PASSWORD; if (!pw) return next();
  const h = req.headers.authorization || '';
  const given = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
  if (given === pw) return next();
  res.set('WWW-Authenticate', 'Basic realm="videoprodutos"').status(401).send('senha necessária');
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'web')));

// arquivos dos projetos (imagens/vídeos) servidos em /out/<id>/...
app.use('/out', express.static(cfg.OUTPUT_DIR, { acceptRanges: true }));
const rel = f => f && f.startsWith(loadConfig().OUTPUT_DIR) ? '/out' + f.slice(loadConfig().OUTPUT_DIR.length) : null;

app.get('/api/meta', (req, res) => res.json({
  presets: Object.fromEntries(Object.entries(IMAGE_PRESETS).map(([k, v]) => [k, { label: v.label, desc: v.desc, ai: !!v.ai }])),
  styles: Object.fromEntries(Object.entries(VIDEO_STYLES).map(([k, v]) => [k, { label: v.label, desc: v.desc }])),
  categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { preset: v.preset, style: v.style }])),
  outputDir: loadConfig().OUTPUT_DIR, version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
}));

app.get('/api/queue', (req, res) => res.json(queue.list().map(j => ({ ...j, log: j.log.slice(-6) }))));
app.get('/api/queue/:id', (req, res) => { const j = queue.get(req.params.id); j ? res.json(j) : res.status(404).json({ error: 'não encontrado' }); });
app.post('/api/queue', (req, res) => {
  const { source, options, name, batch } = req.body || {};
  const added = [];
  if (batch) {
    for (const line of String(batch).split(/\r?\n/).map(s => s.trim()).filter(l => l && !l.startsWith('#'))) {
      const j = newJobFromLine(line); if (!j) continue;
      added.push(queue.add({ source: j.source, options: { ...(options || {}), ...j.options } }));
    }
  } else if (source) added.push(queue.add({ source: source.trim(), options: options || {}, name }));
  if (!added.length) return res.status(400).json({ error: 'informe uma fonte (pasta ou URL) ou um lote' });
  res.json(added);
});
app.post('/api/queue/:id/cancel', (req, res) => { queue.cancel(req.params.id); res.json({ ok: true }); });
app.post('/api/queue/:id/retry', (req, res) => { queue.retry(req.params.id); res.json({ ok: true }); });
app.delete('/api/queue/:id', (req, res) => res.json({ ok: queue.remove(req.params.id) }));
app.post('/api/queue/clear', (req, res) => { queue.clearDone(); res.json({ ok: true }); });

// eventos ao vivo (SSE)
app.get('/api/events', (req, res) => {
  res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.flushHeaders();
  const onChange = () => res.write(`event: change\ndata: {}\n\n`);
  const onLog = (id, line) => res.write(`event: log\ndata: ${JSON.stringify({ id, line })}\n\n`);
  queue.on('change', onChange); queue.on('log', onLog);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { queue.off('change', onChange); queue.off('log', onLog); clearInterval(ping); });
});

// projetos concluídos (lê projeto.json de cada pasta)
function readProject(id) {
  const f = path.join(loadConfig().OUTPUT_DIR, id, 'projeto.json');
  if (!fs.existsSync(f)) return null;
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const mapObj = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? rel(v) : mapObj(v)]));
  return {
    ...m,
    products: m.products.map(p => ({ ...p, originals: (p.originals || []).map(rel), images: mapObj(p.images), video: p.video && { ...p.video, formats: mapObj(p.video.formats) } })),
    compilation: mapObj(m.compilation),
  };
}
app.get('/api/projects', (req, res) => {
  const out = loadConfig().OUTPUT_DIR;
  const ids = fs.existsSync(out) ? fs.readdirSync(out).filter(d => fs.existsSync(path.join(out, d, 'projeto.json'))) : [];
  res.json(ids.map(id => { const m = readProject(id); return { id, name: m.name, source: m.source, createdAt: m.createdAt, finishedAt: m.finishedAt, products: m.products.length, thumb: m.products[0]?.images?.[m.products[0].preset]?.post?.square || null }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});
app.get('/api/projects/:id', (req, res) => { const m = readProject(req.params.id); m ? res.json(m) : res.status(404).json({ error: 'não encontrado' }); });
app.delete('/api/projects/:id', (req, res) => { const d = path.join(loadConfig().OUTPUT_DIR, req.params.id); if (fs.existsSync(path.join(d, 'projeto.json'))) fs.rmSync(d, { recursive: true, force: true }); queue.remove(req.params.id); res.json({ ok: true }); });

// configurações (.env) — segredos mascarados na leitura
app.get('/api/config', (req, res) => res.json({ schema: SCHEMA.map(s => ({ ...s, def: s.type === 'password' ? '' : s.def })), values: publicConfig() }));
app.post('/api/config', (req, res) => {
  const patch = {};
  for (const [k, v] of Object.entries(req.body || {})) { const s = SCHEMA.find(x => x.key === k); if (!s) continue; if (s.type === 'password' && String(v).startsWith('••••')) continue; patch[k] = v; }
  saveConfig(patch); ensureDirs(); res.json({ ok: true, values: publicConfig() });
});
app.get('/api/health', async (req, res) => {
  const c = loadConfig();
  const probe = async (url, ms = 3000) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.ok; } catch { return false; } };
  res.json({
    ollama: c.LLM_PROVIDER === 'ollama' ? await probe(`${c.OLLAMA_URL}/api/tags`) : null,
    inemaimg: c.IMG_PROVIDER === 'inemaimg' ? await probe(`${c.INEMAIMG_URL}/health`) : null,
    inemavox: await probe(`${c.INEMAVOX_URL}/api/system/status`),
    rembg: fs.existsSync(c.PYTHON),
    engine: c.VIDEO_ENGINE, agnesKey: !!c.AGNES_API_KEY,
    llm: c.LLM_PROVIDER, img: c.IMG_PROVIDER, tts: c.TTS_ENGINE, music: c.MUSIC,
  });
});

// listar pastas do disco para o seletor de pasta
app.get('/api/fs', (req, res) => {
  const p = path.resolve(String(req.query.path || process.env.HOME).replace(/^~/, process.env.HOME));
  try {
    const entries = fs.readdirSync(p, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
    res.json({ path: p, parent: path.dirname(p), dirs: entries.filter(e => e.isDirectory()).map(e => e.name).sort(), images: entries.filter(e => e.isFile() && /\.(jpe?g|png|webp|avif|gif)$/i.test(e.name)).length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const port = parseInt(cfg.PORT, 10) || 3080;
app.listen(port, () => console.log(`videoprodutos → http://localhost:${port}  (saída: ${cfg.OUTPUT_DIR})`));
