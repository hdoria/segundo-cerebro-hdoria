import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from './components/button.jsx';
import { readDesignNumber } from '../design/tokens.js';
import { LIBRARY_LAYOUT_STORAGE_KEY, parseLayoutPreferences, serializeLayoutPreferences, panelVisibility, resolvePanelLayout, resizePanelForKey } from './library-layout.js';

const tokenNames = {
  categoryDefault: '--library-category-default', categoryMin: '--library-category-min', categoryMax: '--library-category-max',
  listDefault: '--library-list-default', listMin: '--library-list-min', listMax: '--library-list-max',
  readerMin: '--library-reader-min', separator: '--library-separator-width', step: '--library-resize-step',
};
function persist(preferences) {
  try { window.localStorage.setItem(LIBRARY_LAYOUT_STORAGE_KEY, serializeLayoutPreferences(preferences)); } catch { /* Local preferences are optional. */ }
}

export function LibraryPanelLayout({ state = {}, children }) {
  const panes = React.Children.toArray(children);
  if (panes.length !== 3) throw new Error('LibraryPanelLayout requires category, list and reader panes.');
  const host = React.useRef(null);
  const drag = React.useRef(null);
  const widths = React.useRef({});
  const [preferences, setPreferences] = React.useState({});
  const [measurement, setMeasurement] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const mode = measurement?.mode || 'desktop';
  const visible = panelVisibility(state, mode);
  const layout = measurement && resolvePanelLayout({ width: measurement.width, config: measurement.config, preferences, visible });
  const update = next => { widths.current = next; setPreferences(next); };
  const finishDrag = save => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    setDragging(false);
    if (save) persist(widths.current);
  };

  React.useEffect(() => {
    try { update(parseLayoutPreferences(window.localStorage.getItem(LIBRARY_LAYOUT_STORAGE_KEY))); } catch { /* Storage may be disabled. */ }
    const element = host.current;
    const measure = () => {
      const styles = window.getComputedStyle(element);
      const next = {
        width: element.getBoundingClientRect().width,
        mode: styles.getPropertyValue('--library-layout-mode').trim() || 'desktop',
        config: Object.fromEntries(Object.entries(tokenNames).map(([key, name]) => [key, readDesignNumber(name, styles)])),
      };
      setMeasurement(previous => previous && previous.width === next.width && previous.mode === next.mode && Object.keys(next.config).every(key => previous.config[key] === next.config[key]) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      const active = drag.current;
      drag.current = null;
      if (active?.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    };
  }, []);
  React.useEffect(() => { finishDrag(true); }, [mode, state.expanded, state.filtersCollapsed, state.panel]);

  const separator = (pane, label) => {
    const field = `${pane}Width`;
    const range = layout?.ranges[pane];
    const value = layout?.[field];
    return <div className={`library-pane-separator library-pane-separator-${pane}`} role="separator" aria-label={label} aria-orientation="vertical" tabIndex={0}
      aria-valuemin={range && Math.round(range.min)} aria-valuemax={range && Math.round(range.max)} aria-valuenow={value === undefined ? undefined : Math.round(value)} aria-valuetext={value === undefined ? undefined : `${Math.round(value)} pixels`}
      onKeyDown={event => {
        if (!layout) return;
        const next = resizePanelForKey(event.key, value, range, measurement.config.step);
        if (next === null) return;
        event.preventDefault();
        const preferences = { ...widths.current, [field]: next };
        update(preferences);
        persist(preferences);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || !layout) return;
        event.preventDefault();
        finishDrag(true);
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { element: event.currentTarget, pointerId: event.pointerId, startX: event.clientX, startWidth: value, field, range };
        setDragging(true);
      }}
      onPointerMove={event => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const width = Math.min(active.range.max, Math.max(active.range.min, active.startWidth + event.clientX - active.startX));
        update({ ...widths.current, [active.field]: width });
      }}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) finishDrag(true); }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) finishDrag(true); }}
      onLostPointerCapture={event => { if (drag.current?.pointerId === event.pointerId) finishDrag(true); }}/>;
  };
  // These CSS dimensions are measured geometry/preferences; authored sizes live in tokens.
  const style = layout ? { '--library-category-width': `${layout.categoryWidth}px`, '--library-list-width': `${layout.listWidth}px`, '--library-separator-size': `${layout.separatorWidth}px` } : undefined;
  return <div ref={host} className="library-panels library-panel-layout" style={style} data-layout-categories={visible.categories} data-layout-list={visible.list} data-layout-dragging={dragging}>
    {panes[0]}
    {visible.categories && separator('category', 'Largura das categorias')}
    {panes[1]}
    {visible.list && separator('list', 'Largura da lista de notas')}
    {panes[2]}
    {visible.list && <Button type="button" variant="outline" size="xs" className="library-layout-reset" onClick={() => {
      finishDrag(false);
      update({});
      try { window.localStorage.removeItem(LIBRARY_LAYOUT_STORAGE_KEY); } catch { /* Local preferences are optional. */ }
    }}><RotateCcw aria-hidden="true"/>Restaurar larguras</Button>}
  </div>;
}
