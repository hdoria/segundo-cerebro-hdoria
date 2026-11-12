export const LIBRARY_LAYOUT_STORAGE_KEY = 'cb-library-layout-v1';
const finiteDimension = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Only dimension fields cross the persistence boundary. Unknown fields are discarded.
export function sanitizeLayoutPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(['categoryWidth', 'listWidth'].filter(key => finiteDimension(value[key])).map(key => [key, value[key]]));
}
export function parseLayoutPreferences(raw) {
  try { return sanitizeLayoutPreferences(JSON.parse(raw)); } catch { return {}; }
}
export function serializeLayoutPreferences(value) { return JSON.stringify(sanitizeLayoutPreferences(value)); }

export function panelVisibility(state = {}, mode = 'desktop') {
  const singlePane = state.expanded || mode === 'mobile' || (mode === 'tablet' && state.panel === 'categories');
  return { categories: !singlePane && mode === 'desktop' && !state.filtersCollapsed, list: !singlePane };
}

export function resolvePanelLayout({ width, preferences = {}, visible, config }) {
  const available = Number.isFinite(width) ? Math.max(0, width) : 0;
  const separators = Number(visible.categories) + Number(visible.list);
  const separatorWidth = separators ? Math.min(config.separator, available / separators) : 0;
  const content = Math.max(0, available - separators * separatorWidth);
  const panelSpace = Math.max(0, content - Math.min(config.readerMin, content));
  const minimum = (visible.categories ? config.categoryMin : 0) + (visible.list ? config.listMin : 0);
  // At narrow intermediate widths, preserve the reader and share remaining space.
  const scale = minimum ? Math.min(1, panelSpace / minimum) : 1;
  const categoryMin = visible.categories ? config.categoryMin * scale : 0;
  const listMin = visible.list ? config.listMin * scale : 0;
  const categoryMax = visible.categories ? Math.max(categoryMin, Math.min(config.categoryMax, panelSpace - listMin)) : 0;
  const safe = sanitizeLayoutPreferences(preferences);
  const categoryWidth = visible.categories ? clamp(safe.categoryWidth ?? config.categoryDefault, categoryMin, categoryMax) : 0;
  const listMax = visible.list ? Math.max(listMin, Math.min(config.listMax, panelSpace - categoryWidth)) : 0;
  const listWidth = visible.list ? clamp(safe.listWidth ?? config.listDefault, listMin, listMax) : 0;
  return {
    categoryWidth, listWidth, separatorWidth,
    readerWidth: Math.max(0, content - categoryWidth - listWidth),
    ranges: { category: { min: categoryMin, max: categoryMax }, list: { min: listMin, max: listMax } },
  };
}

export function resizePanelForKey(key, width, range, step) {
  const values = { ArrowLeft: width - step, ArrowRight: width + step, Home: range.min, End: range.max };
  return Object.hasOwn(values, key) ? clamp(values[key], range.min, range.max) : null;
}
