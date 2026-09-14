// Copy do vídeo (headline, benefícios, CTA) + classificação — LLM opcional com fallback por template.
import { loadConfig } from './config.js';
import { detectCategory, CATEGORIES } from './presets.js';

const CAT_LIST = Object.keys(CATEGORIES).join(', ');

function templateCopy(p, category) {
  const name = p.name;
  const byCat = {
    tecnologia: { headline: `${name}`, tagline: 'Tecnologia que acompanha o seu ritmo', benefits: ['Design moderno', 'Alta performance', 'Pronto para o dia a dia'] },
    moda: { headline: `${name}`, tagline: 'Estilo que fala por você', benefits: ['Caimento perfeito', 'Conforto o dia inteiro', 'Combina com tudo'] },
    beleza: { headline: `${name}`, tagline: 'Cuidado que se vê no espelho', benefits: ['Fórmula suave', 'Resultado visível', 'Uso diário'] },
    alimento: { headline: `${name}`, tagline: 'Sabor de verdade, todo dia', benefits: ['Ingredientes selecionados', 'Sabor marcante', 'Feito com carinho'] },
    casa: { headline: `${name}`, tagline: 'Sua casa com mais vida', benefits: ['Design que decora', 'Praticidade real', 'Qualidade que dura'] },
    esporte: { headline: `${name}`, tagline: 'Feito para quem não para', benefits: ['Leve e resistente', 'Conforto no movimento', 'Performance de verdade'] },
    infantil: { headline: `${name}`, tagline: 'Diversão segura para os pequenos', benefits: ['Material seguro', 'Estimula a criatividade', 'Horas de brincadeira'] },
    pet: { headline: `${name}`, tagline: 'Seu pet merece o melhor', benefits: ['Seguro e confortável', 'Aprovado pelos pets', 'Fácil de usar'] },
    joias: { headline: `${name}`, tagline: 'Brilho que marca momentos', benefits: ['Acabamento impecável', 'Elegância atemporal', 'Presente perfeito'] },
    educacao: { headline: `${name}`, tagline: 'Aprenda de verdade, no seu ritmo', benefits: ['Conteúdo direto ao ponto', 'Passo a passo prático', 'Resultados reais'] },
    games: { headline: `${name}`, tagline: 'Suba de nível', benefits: ['Resposta imediata', 'Imersão total', 'Feito para gamers'] },
    automotivo: { headline: `${name}`, tagline: 'Potência e confiança na estrada', benefits: ['Durabilidade extrema', 'Instalação fácil', 'Segurança em primeiro lugar'] },
  };
  const base = byCat[category] || { headline: name, tagline: 'Qualidade que você sente', benefits: ['Design pensado nos detalhes', 'Qualidade garantida', 'Entrega rápida'] };
  return { ...base, cta: loadConfig().CTA || 'Garanta o seu', category };
}

async function askLLM(prompt) {
  const cfg = loadConfig();
  if (cfg.LLM_PROVIDER === 'ollama') {
    const r = await fetch(`${cfg.OLLAMA_URL}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.OLLAMA_MODEL, prompt, stream: false, think: false, format: 'json', options: { temperature: 0.7, num_predict: 400 } }), signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`ollama HTTP ${r.status}`);
    return (await r.json()).response;
  }
  if (cfg.LLM_PROVIDER === 'openai' || cfg.LLM_PROVIDER === 'agnes') {
    const isAgnes = cfg.LLM_PROVIDER === 'agnes';
    const base = (isAgnes ? cfg.AGNES_BASE_URL : cfg.LLM_BASE_URL).replace(/\/$/, '');
    const key = isAgnes ? cfg.AGNES_API_KEY : cfg.LLM_API_KEY;
    const model = isAgnes ? cfg.AGNES_TEXT_MODEL : cfg.LLM_MODEL;
    if (!key) throw new Error(`${cfg.LLM_PROVIDER}: API key vazia`);
    let lastErr;
    for (let t = 0; t < 3; t++) {
      try {
        const body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 };
        if (!isAgnes) body.response_format = { type: 'json_object' };
        const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error(`llm HTTP ${r.status}`);
        return (await r.json()).choices[0].message.content;
      } catch (e) { lastErr = e; await new Promise(res => setTimeout(res, 3000 * (t + 1))); }
    }
    throw lastErr;
  }
  throw new Error('LLM desativado');
}

const sanitize = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function buildCopy(product, log = () => {}) {
  const category = product.category && CATEGORIES[product.category] ? product.category : detectCategory(product);
  const fallback = templateCopy(product, category);
  const cfg = loadConfig();
  if (cfg.LLM_PROVIDER === 'none') return { ...fallback, llm: false };
  const prompt = `Você é um redator de vídeos promocionais curtos (Reels) em português do Brasil.
Produto: "${product.name}"
Descrição: "${(product.desc || '').slice(0, 500) || '(sem descrição)'}"
Preço: "${product.price || '(não informado)'}"
Responda SOMENTE um JSON com as chaves:
- "category": uma destas: ${CAT_LIST}, geral
- "headline": título de impacto, até 5 palavras, sem ponto final
- "tagline": frase de desejo, até 9 palavras
- "benefits": lista de 3 benefícios, cada um com até 4 palavras
- "cta": chamada para ação, até 4 palavras
- "scene": em INGLÊS, uma descrição curta (até 25 palavras) do CENÁRIO DE FUNDO (superfície, ambiente, luz) onde este produto seria fotografado num anúncio — sem o produto em si, sem pessoas, sem animais, sem texto
Regras: tom POSITIVO e aspiracional (desejo, prazer, conquista, conforto); NUNCA use palavras negativas como sofrimento, dor, medo, problema, extremo, agressivo. Linguagem natural de anúncio brasileiro. Exemplos de headline boas: "Som que enche a casa", "Estilo que fala por você", "Café que acorda a alma".
Não use aspas dentro dos textos. Não invente características técnicas específicas.`;
  try {
    const raw = await askLLM(prompt);
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    const out = {
      category: CATEGORIES[j.category] ? j.category : category,
      headline: sanitize(j.headline, 40) || fallback.headline,
      tagline: sanitize(j.tagline, 70) || fallback.tagline,
      benefits: (Array.isArray(j.benefits) ? j.benefits : []).map(b => sanitize(b, 32)).filter(Boolean).slice(0, 3),
      cta: sanitize(j.cta, 28) || fallback.cta,
      scene: sanitize(j.scene, 220),
      llm: true,
    };
    if (out.benefits.length < 3) out.benefits = fallback.benefits;
    log(`copy via LLM (${cfg.LLM_PROVIDER}): "${out.headline}" / ${out.category}`);
    return out;
  } catch (e) {
    log(`LLM indisponível (${e.message}) — usando copy por template`);
    return { ...fallback, llm: false };
  }
}
