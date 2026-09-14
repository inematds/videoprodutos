// Catálogo de presets de imagem, estilos de vídeo e categorias de produto.
// "auto" escolhe pelo que o produto é (categoria detectada).

export const IMAGE_PRESETS = {
  'estudio-branco': { label: 'Estúdio branco', desc: 'Fundo branco limpo, sombra suave, look e-commerce.', bg: ['#ffffff', '#f2f2f2'], text: '#111111', accent: '#e63946', grade: { brightness: 1.03, saturation: 1.05 }, shadow: true, cutout: true },
  'dark-premium': { label: 'Dark premium', desc: 'Fundo escuro com brilho âmbar, luxo e tecnologia.', bg: ['#1a1410', '#050505'], text: '#ffffff', accent: '#f2b03c', grade: { brightness: 1.0, saturation: 1.1 }, glow: '#f2b03c', cutout: true },
  'vibrante': { label: 'Vibrante', desc: 'Gradiente colorido, cores saturadas, energia jovem.', bg: ['#ff6b6b', '#feca57', '#48dbfb'], text: '#ffffff', accent: '#ffffff', grade: { brightness: 1.02, saturation: 1.3 }, cutout: true },
  'minimal': { label: 'Minimal', desc: 'Tons pastéis, muito respiro, estética clean.', bg: ['#f7f3ee', '#e8e2da'], text: '#2b2b2b', accent: '#7c6f64', grade: { brightness: 1.02, saturation: 0.9 }, shadow: true, cutout: true },
  'quente-vintage': { label: 'Quente / vintage', desc: 'Tons quentes, leve grão, artesanal e aconchegante.', bg: ['#6b3f1d', '#2e1a0c'], text: '#fbe9d0', accent: '#f4a261', grade: { brightness: 0.98, saturation: 0.85, tint: '#c98a4b' }, grain: true, cutout: true },
  'neon': { label: 'Neon / cyber', desc: 'Fundo preto-azulado, luz neon magenta/ciano.', bg: ['#0b0f2a', '#000000'], text: '#ffffff', accent: '#00e5ff', grade: { brightness: 1.0, saturation: 1.25 }, glow: '#ff2bd6', cutout: true },
  'natural': { label: 'Natural / eco', desc: 'Verde-oliva e bege, orgânico e saudável.', bg: ['#cfd8c3', '#8fa37a'], text: '#1f2a1a', accent: '#2f5d3a', grade: { brightness: 1.02, saturation: 0.95 }, shadow: true, cutout: true },
  'original': { label: 'Original (só ajuste)', desc: 'Mantém a foto, só corrige luz/cor e enquadra.', bg: null, text: '#ffffff', accent: '#f2b03c', grade: { brightness: 1.02, saturation: 1.05 }, cutout: false },
  'cenario-ia': { label: 'Cenário por IA', desc: 'Gera um cenário fotográfico coerente com o produto (inemaimg/Agnes) e recompõe.', bg: ['#111111', '#000000'], text: '#ffffff', accent: '#f2b03c', grade: { brightness: 1.0, saturation: 1.05 }, cutout: true, ai: true },
};

export const VIDEO_STYLES = {
  'dinamico': { label: 'Dinâmico', desc: 'Cortes rápidos, zoom com punch, ideal para Reels/TikTok.', shot: 2.2, xfade: 0.25, transition: 'slideleft', zoom: 'punch', music: 'upbeat energetic pop', grade: 'pop' },
  'elegante': { label: 'Elegante', desc: 'Ritmo lento, fades, fotografia de luxo.', shot: 3.6, xfade: 0.8, transition: 'fade', zoom: 'slow', music: 'elegant piano cinematic', grade: 'soft' },
  'tech': { label: 'Tech', desc: 'Glitch sutil, azul/ciano, cortes secos.', shot: 2.6, xfade: 0.2, transition: 'wipeleft', zoom: 'drift', music: 'electronic technology synth', grade: 'cool' },
  'natural': { label: 'Natural', desc: 'Luz quente, movimentos suaves, orgânico.', shot: 3.2, xfade: 0.6, transition: 'fade', zoom: 'slow', music: 'acoustic guitar happy', grade: 'warm' },
  'promo': { label: 'Promoção', desc: 'Preço em destaque, urgência, CTA forte.', shot: 2.4, xfade: 0.3, transition: 'slideup', zoom: 'punch', music: 'upbeat corporate advertisement', grade: 'pop' },
  'cinematico': { label: 'Cinemático', desc: 'Widescreen, vinheta, contraste, trilha épica.', shot: 3.4, xfade: 0.7, transition: 'fadeblack', zoom: 'drift', music: 'epic cinematic trailer', grade: 'cinema' },
};

// Categorias detectáveis: palavras-chave → preset + estilo sugeridos
export const CATEGORIES = {
  tecnologia: { kw: ['fone', 'headphone', 'speaker', 'caixa de som', 'bluetooth', 'smart', 'phone', 'celular', 'notebook', 'laptop', 'gadget', 'usb', 'wireless', 'gamer', 'mouse', 'teclado', 'câmera', 'camera', 'led', 'drone', 'relógio', 'watch', 'eletrônic', 'tv', 'monitor', 'carregador', 'console'], preset: 'dark-premium', style: 'tech' },
  moda: { kw: ['camiseta', 'camisa', 'vestido', 'calça', 'jaqueta', 'tênis', 'sapato', 'bolsa', 'roupa', 'moda', 'blusa', 'saia', 'jeans', 'shirt', 'dress', 'shoe', 'sneaker', 'boné', 'óculos', 'bikini', 'legging', 'fitness wear'], preset: 'minimal', style: 'elegante' },
  beleza: { kw: ['creme', 'sérum', 'serum', 'perfume', 'batom', 'maquiagem', 'skincare', 'shampoo', 'cabelo', 'hidratante', 'cosmético', 'beauty', 'fragrância', 'esmalte', 'sabonete'], preset: 'minimal', style: 'elegante' },
  alimento: { kw: ['café', 'coffee', 'chocolate', 'bolo', 'doce', 'cerveja', 'vinho', 'suco', 'chá', 'tea', 'comida', 'lanche', 'snack', 'granola', 'mel', 'queijo', 'pão', 'bebida', 'whey', 'suplemento', 'orgânico', 'organic', 'tempero', 'molho'], preset: 'quente-vintage', style: 'natural' },
  casa: { kw: ['luminária', 'sofá', 'mesa', 'cadeira', 'decoração', 'vaso', 'cozinha', 'panela', 'copo', 'caneca', 'toalha', 'lençol', 'tapete', 'quadro', 'móvel', 'jardim', 'ferramenta', 'organizador', 'garrafa', 'candle', 'vela'], preset: 'natural', style: 'natural' },
  esporte: { kw: ['bicicleta', 'bike', 'academia', 'treino', 'halter', 'yoga', 'corrida', 'bola', 'esporte', 'sport', 'skate', 'surf', 'mochila', 'trilha', 'camping'], preset: 'vibrante', style: 'dinamico' },
  infantil: { kw: ['brinquedo', 'bebê', 'baby', 'criança', 'infantil', 'kids', 'toy', 'pelúcia', 'boneca', 'lego', 'escolar'], preset: 'vibrante', style: 'dinamico' },
  pet: { kw: ['pet', 'cachorro', 'dog', 'gato', 'cat', 'ração', 'coleira', 'aquário', 'petisco'], preset: 'natural', style: 'natural' },
  automotivo: { kw: ['carro', 'auto', 'moto', 'pneu', 'motor', 'peça', 'acessório automotivo', 'capacete'], preset: 'dark-premium', style: 'cinematico' },
  joias: { kw: ['anel', 'colar', 'brinco', 'joia', 'jóia', 'ouro', 'prata', 'pulseira', 'diamante', 'jewel', 'ring', 'necklace'], preset: 'dark-premium', style: 'elegante' },
  educacao: { kw: ['curso', 'livro', 'ebook', 'e-book', 'aula', 'mentoria', 'treinamento', 'workshop', 'book', 'course', 'planner', 'caderno'], preset: 'estudio-branco', style: 'promo' },
  games: { kw: ['game', 'jogo', 'playstation', 'xbox', 'nintendo', 'rpg', 'controle'], preset: 'neon', style: 'tech' },
};

export function detectCategory(product) {
  const text = `${product.name} ${product.desc} ${product.category}`.toLowerCase();
  let best = null, bestScore = 0;
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    let s = 0;
    for (const k of def.kw) if (text.includes(k)) s += k.length > 4 ? 2 : 1;
    if (s > bestScore) { best = cat; bestScore = s; }
  }
  return best || 'geral';
}

export function autoChoice(category) {
  const def = CATEGORIES[category];
  return { preset: def?.preset || 'dark-premium', style: def?.style || 'dinamico' };
}
