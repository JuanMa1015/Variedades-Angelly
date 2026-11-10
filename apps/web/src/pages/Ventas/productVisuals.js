const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const resolveImageUrl = (url) => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
};

const VISUAL_RULES = [
  { match: /arroz|grano|lenteja|frijol/i, icon: '🍚', tint: 'bg-amber-50' },
  { match: /pan|galleta|torta|ponque/i, icon: '🥖', tint: 'bg-orange-50' },
  { match: /leche|queso|yogurt|mantequilla/i, icon: '🥛', tint: 'bg-sky-50' },
  { match: /coca|gaseosa|jugo|agua|bebida|pool/i, icon: '🥤', tint: 'bg-cyan-50' },
  { match: /huevo/i, icon: '🥚', tint: 'bg-yellow-50' },
  { match: /pollo|carne|atun|salchicha/i, icon: '🍗', tint: 'bg-rose-50' },
  { match: /aseo|jabon|detergente|cloro/i, icon: '🧼', tint: 'bg-emerald-50' },
  { match: /shampoo|crema|higiene/i, icon: '🧴', tint: 'bg-violet-50' },
];

export const DEFAULT_TINT = 'bg-blush-100';

export const getProductVisual = (nombre = '') => VISUAL_RULES.find((rule) => rule.match.test(nombre)) ?? null;

export const getInitials = (nombre = '') => {
  const words = String(nombre).trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
};
