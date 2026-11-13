import { Graph, NodeEvent } from '@antv/g6';
import {
  AppWindow,
  BookOpenText,
  Boxes,
  BrainCircuit,
  Building2,
  FileChartColumn,
  FileOutput,
  Gavel,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
  Webhook,
} from '@lucide/icons';
import { buildLucideDataUri } from '@lucide/icons/build';
import {
  siClickup,
  siFathom,
  siGithub,
  siGoogledrive,
  siMeta,
  siSupabase,
  siWhatsapp,
} from 'simple-icons';
import {
  operationalPositions,
  readableViewportPlan,
} from './canvas-layout-policy.js';
import { readDesignToken, readDesignNumber } from './design/tokens.js';

// CSS is the single value authority, including renderer geometry and motion.
const token = readDesignToken;
const number = readDesignNumber;

const KIND_TOKEN = {
  source: '--kind-source', area: '--kind-area', system: '--kind-system', routine: '--kind-routine',
  collector: '--kind-source', retrieval: '--kind-area', skill: '--kind-skill', capability: '--kind-system',
  stage: '--kind-area', artifact: '--kind-artifact', output: '--kind-artifact', gate: '--kind-gate', judgment: '--kind-gate',
  run: '--kind-run', handoff: '--run', model: '--kind-skill', connector: '--kind-source',
};

function kindAccent(kind) {
  return KIND_TOKEN[kind] ? token(KIND_TOKEN[kind]) : token('--text-3');
}


const KIND_LABEL = {
  source: 'Fonte',
  area: 'Área',
  system: 'Sistema',
  routine: 'Rotina',
  collector: 'Coleta',
  retrieval: 'Contexto',
  skill: 'Skill',
  capability: 'Capability',
  stage: 'Etapa',
  artifact: 'Artefato',
  output: 'Output',
  gate: 'Gate',
  judgment: 'Julgamento',
  run: 'Execução',
  handoff: 'Handoff',
  model: 'Modelo',
  connector: 'Conector',
};

const STATE_LABEL = {
  declared: 'Declarado',
  active: 'Ativo',
  running: 'Executando',
  completed: 'Concluído',
  gap: 'Lacuna',
  pending: 'Pendente',
  failed: 'Falhou',
  denied: 'Negado',
  skipped: 'Pulado',
};

const KIND_ICON = {
  area: Building2,
  system: Boxes,
  routine: RefreshCw,
  collector: Webhook,
  retrieval: Search,
  skill: Sparkles,
  capability: BrainCircuit,
  stage: RefreshCw,
  artifact: FileOutput,
  output: FileOutput,
  gate: ShieldCheck,
  judgment: Gavel,
  run: RefreshCw,
  handoff: Share2,
  model: BrainCircuit,
  connector: Webhook,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function simpleIconDataUri(icon, color = `#${icon.hex}`) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(icon.title)}"><path fill="${color}" d="${icon.path}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function functionalIconDataUri(icon, color) {
  return buildLucideDataUri(icon, {
    size: number('--canvas-icon-size'), color,
    strokeWidth: number('--canvas-icon-stroke'), absoluteStrokeWidth: true,
  });
}

function sourceIcon(node) {
  const ref = `${node.id} ${node.details?.ref || ''} ${node.details?.type || ''}`.toLowerCase();
  if (ref.includes('clickup')) return simpleIconDataUri(siClickup);
  if (ref.includes('drive')) return simpleIconDataUri(siGoogledrive);
  if (ref.includes('fathom')) return simpleIconDataUri(siFathom);
  if (ref.includes('github') || ref.includes('git-repository')) return simpleIconDataUri(siGithub, token('--text'));
  if (ref.includes('meta-marketing')) return simpleIconDataUri(siMeta);
  if (ref.includes('supabase')) return simpleIconDataUri(siSupabase);
  if (ref.includes('whatsapp')) return simpleIconDataUri(siWhatsapp);
  if (ref.includes('funnel') || ref.includes('experiment')) return functionalIconDataUri(FileChartColumn, token('--kind-area'));
  if (ref.includes('platform')) return functionalIconDataUri(AppWindow, token('--kind-area'));
  if (ref.includes('social')) return functionalIconDataUri(Share2, token('--kind-area'));
  if (ref.includes('vault') || ref.includes('knowledge')) return functionalIconDataUri(BookOpenText, token('--kind-area'));
  if (ref.includes('video') || ref.includes('vturb')) return functionalIconDataUri(Video, token('--kind-area'));
  return functionalIconDataUri(BookOpenText, token('--kind-area'));
}

function nodeIcon(node) {
  if (node.kind === 'source') return sourceIcon(node);
  return functionalIconDataUri(KIND_ICON[node.kind] || Boxes, kindAccent(node.kind));
}

function nodeType() {
  return 'html';
}

// Nós compactos: círculo-ícone + label mono embaixo (linguagem de constelação,
// não de formulário). Hubs um pouco maiores que satélites.
function nodeSize(datum) {
  const kind = datum.data.kind;
  const scale = kind === 'area' ? 'area'
    : ['system', 'run'].includes(kind) ? 'hub'
      : ['routine', 'capability'].includes(kind) ? 'capability' : 'default';
  return [number(`--canvas-node-${scale}-width`), number(`--canvas-node-${scale}-height`)];
}

function nodeMarkup(datum) {
  const node = datum.data;
  const kind = KIND_LABEL[node.kind] || node.kind;
  const state = STATE_LABEL[node.state] || node.state;
  const trace = node.actual ? '<span class="brain-node-trace">REAL</span>' : '';
  return `<div class="brain-node brain-node--${escapeHtml(node.kind)} brain-node--state-${escapeHtml(node.state)}${node.actual ? ' is-actual' : ''}" data-node-id="${escapeHtml(node.id)}" title="${escapeHtml(node.label)} — ${escapeHtml(kind)} · ${escapeHtml(state)}">
    <span class="brain-node-ring"><span class="brain-node-icon"><img src="${nodeIcon(node)}" alt="" /></span>${trace}<i class="brain-node-state"></i></span>
    <span class="brain-node-copy"><strong>${escapeHtml(node.label)}</strong></span>
  </div>`;
}

function brainPositions(model) {
  // Mandala radial: fontes (casas de verdade) no coração, sistemas no anel
  // médio agrupados por área, áreas como hubs externos, rotinas penduradas.
  // As arestas sistema→fonte convergem para o centro — o desenho é o leque.
  const positions = {};
  const areas = model.nodes.filter((node) => node.kind === 'area');
  const systems = model.nodes.filter((node) => node.kind === 'system');
  const sources = model.nodes.filter((node) => node.kind === 'source');
  const routines = model.nodes.filter((node) => node.kind === 'routine');
  const handoffs = model.nodes.filter((node) => node.kind === 'handoff');
  const areaBySystem = new Map(model.edges
    .filter((edge) => edge.relation === 'contains')
    .map((edge) => [edge.target, edge.source]));
  const systemByRoutine = new Map(model.edges
    .filter((edge) => edge.relation === 'operates')
    .map((edge) => [edge.target, edge.source]));

  const TAU = Math.PI * 2;
  const SQUASH = number('--canvas-brain-squash');
  const at = (radius, angle) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * SQUASH });
  const radius = (kind) => number(`--canvas-brain-radius-${kind}`);

  sources.forEach((source, index) => {
    positions[source.id] = at(radius('source'), -Math.PI / 2 + (index / Math.max(1, sources.length)) * TAU);
  });

  const areaOrder = [...areas.map((area) => area.id), null];
  const grouped = areaOrder.flatMap((areaId) => systems.filter((system) => (areaBySystem.get(system.id) || null) === areaId));
  const systemAngle = new Map();
  grouped.forEach((system, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, grouped.length)) * TAU;
    systemAngle.set(system.id, angle);
    positions[system.id] = at(radius('system'), angle);
  });

  const areaAngles = [];
  const emptyAreas = [];
  areas.forEach((area) => {
    const owned = grouped.filter((system) => areaBySystem.get(system.id) === area.id);
    if (!owned.length) return emptyAreas.push(area);
    const angle = owned.reduce((sum, system) => sum + systemAngle.get(system.id), 0) / owned.length;
    areaAngles.push(angle);
    positions[area.id] = at(radius('area'), angle);
  });
  // Área sem Sistema não tem ângulo próprio: ocupa o meio do maior vão livre do anel,
  // para nunca cair em cima de outra Área.
  emptyAreas.forEach((area) => {
    const taken = areaAngles.map((angle) => ((angle % TAU) + TAU) % TAU).sort((a, b) => a - b);
    let angle = -Math.PI / 2;
    if (taken.length) {
      let widest = -1;
      taken.forEach((start, index) => {
        const gap = (index + 1 < taken.length ? taken[index + 1] : taken[0] + TAU) - start;
        if (gap > widest) { widest = gap; angle = start + gap / 2; }
      });
    }
    areaAngles.push(angle);
    positions[area.id] = at(radius('area'), angle);
  });

  routines.forEach((routine, index) => {
    const angle = systemAngle.get(systemByRoutine.get(routine.id));
    positions[routine.id] = angle === undefined
      ? at(radius('orphan'), -Math.PI / 2 + (index / Math.max(1, routines.length)) * TAU)
      : at(radius('routine'), angle + number('--canvas-brain-routine-angle'));
  });

  handoffs.forEach((handoff, index) => {
    const inbound = model.edges.find((edge) => edge.target === handoff.id && edge.source.startsWith('system:'));
    const outbound = model.edges.find((edge) => edge.source === handoff.id && edge.target.startsWith('system:'));
    const left = positions[inbound?.source];
    const right = positions[outbound?.target];
    const inset = number('--canvas-brain-handoff-inset');
    positions[handoff.id] = left && right
      ? { x: ((left.x + right.x) / 2) * inset,
        y: (((left.y + right.y) / 2) * inset)
          + ((index % number('--canvas-brain-handoff-lanes')) * number('--canvas-brain-handoff-stack-gap')) }
      : at(radius('handoff'), (index / Math.max(1, handoffs.length)) * TAU);
  });
  return positions;
}

function defaultPositions(model) {
  return model.graph_type === 'brain' ? brainPositions(model) : operationalPositions(model);
}

function graphData(model) {
  const defaults = defaultPositions(model);
  return {
    nodes: model.nodes.map((node) => ({
      id: node.id,
      type: nodeType({ data: node }),
      data: node,
      states: node.actual ? ['actual'] : [],
      style: {
        x: node.position?.x ?? defaults[node.id]?.x ?? 0,
        y: node.position?.y ?? defaults[node.id]?.y ?? 0,
      },
    })),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: edge,
      states: edge.actual ? ['actual'] : [],
    })),
  };
}

function layoutFor(model) {
  return undefined;
}

function allPositions(graph) {
  return Object.fromEntries(graph.getNodeData().map((node) => {
    const [x, y] = graph.getElementPosition(node.id);
    return [node.id, { x, y }];
  }));
}

function edgeDash(datum, model) {
  const state = datum.data.actual ? 'actual' : model.graph_type === 'brain' ? 'brain' : 'default';
  return [number(`--canvas-dash-${state}-on`), number(`--canvas-dash-${state}-off`)];
}

function rendererAppearance(model, reducedMotion) {
  return {
    // G6 5.1's updateCanvas does not update background after creation. Keep its
    // layer transparent; the CSS viewport owns the theme-responsive surface.
    background: token('--canvas-fill'),
    animation: reducedMotion ? false : {
      duration: number('--canvas-motion-update'), easing: token('--canvas-motion-easing'),
    },
    node: {
      type: nodeType,
      style: {
        size: nodeSize,
        dx: (datum) => -(nodeSize(datum)[0] / 2),
        dy: (datum) => -(nodeSize(datum)[1] / 2),
        innerHTML: nodeMarkup,
        fill: token('--canvas-fill'),
        lineWidth: 0,
        opacity: number('--canvas-opacity-full'),
        cursor: 'pointer',
      },
      state: {
        selected: { opacity: number('--canvas-opacity-full') },
        neighbor: { opacity: number('--canvas-opacity-full') },
        inactive: { opacity: number('--canvas-opacity-node-inactive') },
        actual: { opacity: number('--canvas-opacity-full') },
      },
      animation: reducedMotion ? false : { enter: false, update: 'translate' },
    },
    edge: {
      type: model.graph_type === 'brain' ? 'line' : 'cubic-horizontal',
      style: {
        stroke: (datum) => datum.data.actual ? token('--run') : token('--text-3'),
        lineWidth: (datum) => datum.data.actual ? number('--canvas-edge-width-actual') : number('--canvas-edge-width'),
        opacity: (datum) => datum.data.actual ? number('--canvas-opacity-edge-actual') : number(`--canvas-opacity-edge-${model.graph_type === 'brain' ? 'brain' : 'default'}`),
        lineDash: (datum) => edgeDash(datum, model),
        endArrow: (datum) => datum.data.actual || model.graph_type !== 'brain',
        cursor: 'pointer',
      },
      state: {
        actual: { stroke: token('--run'), lineWidth: number('--canvas-edge-width-actual'), opacity: number('--canvas-opacity-edge-trace') },
        selected: { stroke: token('--text'), lineWidth: number('--canvas-edge-width-selected'), opacity: number('--canvas-opacity-edge-selected') },
        neighbor: { stroke: token('--run'), lineWidth: number('--canvas-edge-width-neighbor'), opacity: number('--canvas-opacity-edge-neighbor') },
        inactive: { opacity: number('--canvas-opacity-edge-inactive') },
      },
      animation: reducedMotion ? false : { enter: false, update: 'fade' },
    },
  };
}

export async function mountOperationalCanvas({
  container,
  model,
  editable = false,
  focusNodeId = null,
  onInspect = () => {},
  onLayoutChange = () => {},
}) {
  if (!container) throw new Error('canvas-container-required');
  container.replaceChildren();
  const data = graphData(model);
  const browser = container.ownerDocument?.defaultView || globalThis;
  const motionPreference = browser.matchMedia?.('(prefers-reduced-motion: reduce)');
  const duration = (name) => motionPreference?.matches ? 0 : number(`--canvas-motion-${name}`);
  const easing = () => token('--canvas-motion-easing');
  const brainPaddingY = number('--canvas-padding-brain-y');
  const brainPaddingX = number('--canvas-padding-brain-x');
  const operationalPadding = number('--canvas-padding-operational');
  const graph = new Graph({
    container,
    data,
    width: container.clientWidth || undefined,
    height: container.clientHeight || undefined,
    padding: model.graph_type === 'brain'
      ? [brainPaddingY, brainPaddingX, brainPaddingY, brainPaddingX]
      : [operationalPadding, operationalPadding, operationalPadding, operationalPadding],
    autoFit: false,
    layout: layoutFor(model),
    behaviors: ['drag-canvas', 'zoom-canvas', ...(editable ? ['drag-element'] : [])],
    ...rendererAppearance(model, motionPreference?.matches),
  });
  const baselineStates = () => Object.fromEntries([
    ...model.nodes.map((node) => [node.id, node.actual ? ['actual'] : []]),
    ...model.edges.map((edge) => [edge.id, edge.actual ? ['actual'] : []]),
  ]);
  const clearDomFocus = () => {
    for (const element of container.querySelectorAll('.brain-node')) {
      element.classList.remove('is-focused', 'is-neighbor', 'is-dimmed');
    }
  };
  let destroyed = false;
  let entireMap = false;
  let resizeFrame = null;
  let zoomFrame = null;
  let themeFrame = null;
  let focusedNodeId = null;
  let width = container.clientWidth;
  let height = container.clientHeight;
  // Zoom semântico: o label contra-escala para continuar legível de longe;
  // muito longe, satélites recolhem o texto e sobram os hubs.
  const applyZoomBand = () => {
    if (destroyed) return;
    let zoom = 1;
    try { zoom = graph.getZoom() || 1; } catch { return; /* runtime ainda não inicializou */ }
    container.style.setProperty('--inv-zoom', String(Math.min(number('--canvas-zoom-label-max'), Math.max(1, 1 / zoom))));
    container.dataset.zoomBand = zoom < number('--canvas-zoom-far') ? 'far' : 'near';
  };
  for (const eventName of ['viewportchange', 'aftertransform']) {
    try { graph.on(eventName, applyZoomBand); } catch { /* nome varia entre versões */ }
  }
  const onWheel = () => {
    if (destroyed || zoomFrame !== null) return;
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = null;
      applyZoomBand();
    });
  };
  container.addEventListener('wheel', onWheel, { passive: true });
  const fitEntireMap = async (duration) => {
    await graph.fitView({ when: 'always', direction: 'both' }, { duration });
    applyZoomBand();
  };
  const fitReadable = async (duration) => {
    await fitEntireMap(duration);
    const plan = readableViewportPlan(model, graph.getZoom());
    if (plan.clamped) {
      await graph.zoomTo(plan.zoom, { duration, easing: easing() });
      if (plan.focus_ids.length) {
        await graph.focusElement(plan.focus_ids, { duration, easing: easing() });
      }
    }
    applyZoomBand();
  };
  const focusNode = async (id, animate = !motionPreference?.matches) => {
    focusedNodeId = id;
    const relatedEdges = graph.getRelatedEdgesData(id);
    const relatedEdgeIds = new Set(relatedEdges.map((edge) => edge.id));
    const relatedNodeIds = new Set([id]);
    for (const edge of relatedEdges) {
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
    }
    const states = {};
    for (const node of model.nodes) {
      states[node.id] = [
        ...(node.actual ? ['actual'] : []),
        node.id === id ? 'selected' : relatedNodeIds.has(node.id) ? 'neighbor' : 'inactive',
      ];
    }
    for (const edge of model.edges) {
      states[edge.id] = [
        ...(edge.actual ? ['actual'] : []),
        relatedEdgeIds.has(edge.id) ? 'neighbor' : 'inactive',
      ];
    }
    clearDomFocus();
    for (const element of container.querySelectorAll('.brain-node')) {
      const nodeId = element.dataset.nodeId;
      element.classList.add(nodeId === id ? 'is-focused' : relatedNodeIds.has(nodeId) ? 'is-neighbor' : 'is-dimmed');
    }
    await graph.setElementState(states, animate);
  };
  graph.on(NodeEvent.CLICK, (event) => {
    const id = event.target?.id;
    if (!id) return;
    const node = model.nodes.find((item) => item.id === id);
    if (node) {
      void focusNode(id);
      onInspect(node);
    }
  });
  if (editable) {
    graph.on(NodeEvent.DRAG_END, () => onLayoutChange(allPositions(graph)));
  }
  await graph.render();
  if (focusNodeId && model.nodes.some((node) => node.id === focusNodeId)) {
    applyZoomBand();
    // foco pedido de fora (ex.: "Ver no mandala"); timeout garante que o mount
    // resolve mesmo com animações estranguladas em aba de fundo
    await Promise.race([
      (async () => {
        await focusNode(focusNodeId);
        await graph.focusElement(focusNodeId, { duration: duration('external-focus'), easing: easing() });
      })(),
      new Promise((resolve) => setTimeout(resolve, number('--canvas-motion-timeout'))),
    ]);
  } else {
    await fitReadable(duration('initial'));
  }
  // Redraw only appearance: G6 retains its data/positions, viewport and trace
  // states. HTML nodes need their neighborhood classes restored after redraw.
  let themeRefresh = Promise.resolve();
  const refreshTheme = () => {
    if (destroyed || themeFrame !== null) return;
    themeFrame = requestAnimationFrame(async () => {
      themeFrame = null;
      themeRefresh = themeRefresh.then(async () => {
        if (destroyed) return;
        try {
          graph.setOptions(rendererAppearance(model, motionPreference?.matches));
          await graph.draw();
        } catch (error) {
          // A workspace change may destroy G6 while its transition settles.
          if (!destroyed) throw error;
          return;
        }
        if (destroyed) return;
        if (focusedNodeId) await focusNode(focusedNodeId, false);
        applyZoomBand();
      });
      await themeRefresh;
    });
  };
  browser.addEventListener?.('cerebro:theme-change', refreshTheme);
  motionPreference?.addEventListener?.('change', refreshTheme);
  const resizeToPane = () => {
    const nextWidth = container.clientWidth;
    const nextHeight = container.clientHeight;
    if (destroyed || !nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return false;
    width = nextWidth;
    height = nextHeight;
    graph.setSize(width, height);
    return true;
  };
  const observer = new ResizeObserver(() => {
    if (destroyed || resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(async () => {
      resizeFrame = null;
      if (resizeToPane() && entireMap) await fitEntireMap(0);
    });
  });
  observer.observe(container);
  const zoomBy = async (ratio) => {
    if (destroyed) return;
    entireMap = false;
    const [minimum, maximum] = graph.getZoomRange();
    await graph.zoomTo(Math.min(maximum, Math.max(minimum, graph.getZoom() * ratio)), { duration: duration('zoom'), easing: easing() });
    applyZoomBand();
  };
  return {
    fit: async () => {
      if (destroyed) return;
      entireMap = true;
      focusedNodeId = null;
      resizeToPane();
      clearDomFocus();
      await graph.setElementState(baselineStates(), false);
      if (!destroyed) await fitEntireMap(duration('fit'));
    },
    zoomIn: () => zoomBy(number('--canvas-zoom-step')),
    zoomOut: () => zoomBy(1 / number('--canvas-zoom-step')),
    focus: async (id) => {
      if (destroyed) return;
      entireMap = false;
      await focusNode(id);
      try { await graph.focusElement(id, { duration: duration('focus'), easing: easing() }); } catch { /* nó fora do grafo atual */ }
    },
    positions: () => allPositions(graph),
    destroy: () => {
      destroyed = true;
      observer.disconnect();
      container.removeEventListener('wheel', onWheel);
      browser.removeEventListener?.('cerebro:theme-change', refreshTheme);
      motionPreference?.removeEventListener?.('change', refreshTheme);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
      if (themeFrame !== null) cancelAnimationFrame(themeFrame);
      graph.destroy();
    },
    accentFor: (kind) => kindAccent(kind),
  };
}
