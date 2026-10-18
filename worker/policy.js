const AREA = { events:'events', magazine:'articles', library:'library', education:'articles', fbd:'fbd', models3d:'models3d' };
export function validPath(path) {
  return typeof path === 'string' && path.length <= 512 && path.split('/').every(p => p && p !== '.' && p !== '..' && !/[\u0000-\u001f\\%]/.test(p));
}
export function isSuper(user, env) {
  return !!user?.email && String(env.ADMIN_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).includes(user.email.toLowerCase());
}
export function areaFor(path) {
  const parts = path.split('/');
  if (parts[0] === 'content') return AREA[parts[1]];
  if (/^(community|selected)/.test(parts[0])) return 'community';
  if (/^(market|stores)/.test(parts[0])) return 'market';
  if (path === 'config/portfolioTags') return 'community';
  if (/^config\/market/.test(path)) return 'market';
  return null;
}
export function publicRead(path) {
  return /^content\//.test(path) || /^config\/(portfolioTags|marketTypes|marketTags)$/.test(path) || /^usernames\/[a-z0-9_]{3,24}$/.test(path);
}
export function mergeData(current, patch, expandDots=true) {
  const output = structuredClone(current || {});
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__','constructor','prototype'].includes(key)) throw new Error('Invalid field');
    const parts = expandDots ? key.split('.') : [key];
    if (parts.some(p => ['__proto__','constructor','prototype'].includes(p))) throw new Error('Invalid field');
    let target = output;
    for (const part of parts.slice(0,-1)) {
      if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
      target = target[part];
    }
    const last = parts.at(-1);
    target[last] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeData(target[last] && typeof target[last] === 'object' ? target[last] : {}, value, false) : value;
  }
  return output;
}
