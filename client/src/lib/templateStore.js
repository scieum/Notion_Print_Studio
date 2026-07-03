/**
 * 커스텀 양식 저장소.
 * 서버(로컬 Express)는 DB에 저장하고, 서버리스(Vercel)는 501을 반환하므로
 * 그 경우 브라우저 localStorage에 저장한다.
 */
const KEY = 'nps_custom_templates';

export function loadLocalTemplates() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY)) || [];
    return list.map((t) => ({ ...t, isPreset: false, local: true }));
  } catch {
    return [];
  }
}

export function saveLocalTemplate(name, style) {
  const list = loadLocalTemplates();
  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  list.push({ id, name, style: { ...style, name } });
  localStorage.setItem(KEY, JSON.stringify(list));
  return id;
}

export function removeLocalTemplate(id) {
  localStorage.setItem(KEY, JSON.stringify(loadLocalTemplates().filter((t) => t.id !== id)));
}

export function isLocalTemplateId(id) {
  return typeof id === 'string' && id.startsWith('local-');
}
