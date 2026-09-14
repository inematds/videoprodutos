// Configuração: defaults locais (custo zero) + overrides opcionais via .env / UI.
// Tudo funciona sem nenhuma API externa. LLM e imagem por IA são opcionais.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_PATH = path.join(ROOT, '.env');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

// Chaves configuráveis — nome, default, descrição (a UI lê esta tabela)
export const SCHEMA = [
  // Geral
  { key: 'PORT', def: '3080', group: 'geral', label: 'Porta do servidor web', type: 'text' },
  { key: 'OUTPUT_DIR', def: path.join(os.homedir(), 'projetos', 'output', 'videoprodutos'), group: 'geral', label: 'Pasta de saída dos projetos', type: 'text' },
  { key: 'BRAND', def: '', group: 'geral', label: 'Marca / assinatura no vídeo (opcional)', type: 'text' },
  { key: 'CTA', def: 'Garanta o seu', group: 'geral', label: 'Chamada final (CTA) padrão', type: 'text' },
  { key: 'APP_PASSWORD', def: '', group: 'geral', label: 'Senha de acesso à página (vazio = sem senha)', type: 'password', help: 'Obrigatória quando exposto na internet (VPS). Usuário: qualquer; senha: esta.' },

  // LLM (copy, classificação) — opcional
  { key: 'LLM_PROVIDER', def: 'ollama', group: 'llm', label: 'Provedor de LLM', type: 'select', options: ['none', 'ollama', 'openai', 'agnes'], help: 'none = só templates locais. ollama = local, grátis. openai = qualquer API compatível (OpenAI, Groq, OpenRouter...). agnes = agnes-2.0-flash (US$ 0, usa as chaves Agnes abaixo).' },
  { key: 'OLLAMA_URL', def: 'http://127.0.0.1:11434', group: 'llm', label: 'URL do Ollama', type: 'text' },
  { key: 'OLLAMA_MODEL', def: 'qwen3.8:27b', group: 'llm', label: 'Modelo Ollama', type: 'text' },
  { key: 'LLM_BASE_URL', def: 'https://api.openai.com/v1', group: 'llm', label: 'Base URL (API compatível OpenAI)', type: 'text' },
  { key: 'LLM_API_KEY', def: '', group: 'llm', label: 'API key (OpenAI-compatível)', type: 'password' },
  { key: 'LLM_MODEL', def: 'gpt-4o-mini', group: 'llm', label: 'Modelo (OpenAI-compatível)', type: 'text' },

  // Imagem por IA (cenários / restyle generativo) — opcional
  { key: 'IMG_PROVIDER', def: 'inemaimg', group: 'img', label: 'Provedor de imagem IA', type: 'select', options: ['none', 'inemaimg', 'agnes', 'openai'], help: 'none = só presets locais (sharp). inemaimg = flux2-klein local. agnes = API Agnes (US$ 0). openai = /images/generations compatível.' },
  { key: 'INEMAIMG_URL', def: 'http://127.0.0.1:8000', group: 'img', label: 'URL do inemaimg', type: 'text' },
  { key: 'INEMAIMG_MODEL', def: 'flux2-klein', group: 'img', label: 'Modelo no inemaimg', type: 'text' },
  { key: 'AGNES_BASE_URL', def: 'https://apihub.agnes-ai.com/v1', group: 'img', label: 'Base URL Agnes', type: 'text' },
  { key: 'AGNES_API_KEY', def: '', group: 'img', label: 'API key Agnes', type: 'password' },
  { key: 'AGNES_MODEL', def: 'agnes-image-2.1-flash', group: 'img', label: 'Modelo Agnes (imagem)', type: 'text' },
  { key: 'AGNES_TEXT_MODEL', def: 'agnes-2.0-flash', group: 'llm', label: 'Modelo Agnes (texto, quando LLM = agnes)', type: 'text' },
  { key: 'IMG_BASE_URL', def: 'https://api.openai.com/v1', group: 'img', label: 'Base URL imagem (OpenAI-compatível)', type: 'text' },
  { key: 'IMG_API_KEY', def: '', group: 'img', label: 'API key imagem (OpenAI-compatível)', type: 'password' },
  { key: 'IMG_MODEL', def: 'gpt-image-1', group: 'img', label: 'Modelo imagem (OpenAI-compatível)', type: 'text' },

  // Áudio — inemavox (local)
  { key: 'INEMAVOX_URL', def: 'http://127.0.0.1:8010', group: 'audio', label: 'URL do inemavox (música/SFX/TTS)', type: 'text' },
  { key: 'TTS_ENGINE', def: 'edge', group: 'audio', label: 'Engine TTS', type: 'select', options: ['none', 'edge', 'edge-local', 'chatterbox'], help: 'edge = Edge TTS via inemavox. edge-local = Edge TTS direto (pip install edge-tts; serve para VPS). chatterbox = voz clonada (rachel), usa GPU via inemavox.' },
  { key: 'TTS_VOICE', def: 'pt-BR-FranciscaNeural', group: 'audio', label: 'Voz TTS', type: 'text', help: 'edge: pt-BR-FranciscaNeural / pt-BR-AntonioNeural. chatterbox: rachel.' },
  { key: 'MUSIC', def: 'freesound', group: 'audio', label: 'Fonte de música', type: 'select', options: ['none', 'freesound', 'freesound-api', 'synth'], help: 'freesound = via inemavox. freesound-api = direto na API do Freesound (precisa da key abaixo; serve para VPS). synth = trilha sintética local.' },
  { key: 'FREESOUND_API_KEY', def: '', group: 'audio', label: 'API key Freesound (para freesound-api)', type: 'password' },

  // Vídeo por IA (clipes de câmera a partir das imagens) — opcional
  { key: 'VIDEO_ENGINE', def: 'ffmpeg', group: 'video', label: 'Motor de vídeo', type: 'select', options: ['ffmpeg', 'agnes', 'kie'], help: 'ffmpeg = zoom/pan local (rápido, offline). agnes = clipes gerados pela Agnes (US$ 0, ~1 min por cena, cai no ffmpeg se falhar). kie = reservado.' },
  { key: 'AGNES_VIDEO_MODEL', def: 'agnes-video-v2.0', group: 'video', label: 'Modelo Agnes (vídeo)', type: 'text' },
  { key: 'AI_SCENES', def: '2', group: 'video', label: 'Cenas por IA por produto (as demais ficam no ffmpeg)', type: 'text', help: '0 = todas as cenas. Com 5 cenas e limite de 5 req/min, cada produto leva ~1 min por cena IA.' },
  { key: 'KIE_API_KEY', def: '', group: 'video', label: 'API key kie.ai (reservado)', type: 'password' },

  // Render
  { key: 'ENCODER', def: 'auto', group: 'render', label: 'Encoder de vídeo', type: 'select', options: ['auto', 'h264_nvenc', 'libx264'] },
  { key: 'PYTHON', def: path.join(ROOT, '.venv', 'bin', 'python'), group: 'render', label: 'Python com rembg (remoção de fundo)', type: 'text' },
];

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

let cache = null;
export function loadConfig(force = false) {
  if (cache && !force) return cache;
  const fileEnv = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
  const cfg = {};
  for (const s of SCHEMA) cfg[s.key] = process.env[s.key] ?? fileEnv[s.key] ?? s.def;
  cache = cfg;
  return cfg;
}

export function saveConfig(patch) {
  const fileEnv = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (!SCHEMA.find(s => s.key === k)) continue;
    if (v === '' || v == null) delete fileEnv[k]; else fileEnv[k] = String(v);
  }
  const lines = ['# videoprodutos — configuração (gerado pela UI; edite à vontade)'];
  for (const s of SCHEMA) if (fileEnv[s.key] !== undefined) lines.push(`${s.key}=${fileEnv[s.key]}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
  return loadConfig(true);
}

// Versão segura para a UI (mascara segredos)
export function publicConfig() {
  const cfg = loadConfig();
  const out = {};
  for (const s of SCHEMA) out[s.key] = s.type === 'password' ? (cfg[s.key] ? '••••••' + cfg[s.key].slice(-4) : '') : cfg[s.key];
  return out;
}

export function ensureDirs() {
  const cfg = loadConfig();
  for (const d of [DATA_DIR, CACHE_DIR, cfg.OUTPUT_DIR, path.join(CACHE_DIR, 'music')]) fs.mkdirSync(d, { recursive: true });
}
