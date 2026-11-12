// Projeção do motor sobre o vault: skills oficiais, bloco gerenciado do AGENTS.md, lançador,
// ponteiro, seeds e regras de .gitignore. O plano usa o mesmo formato de `planUpdate`, então
// `applyPlan` serve para os dois. Nada aqui grava: quem aplica é `applyPlan`/`applySplit`.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  applyPlan, bytesAt, expandEntries, hash, mergeClaude, planUpdate, revertPlan, safePath, stat, TAG_RE,
} from '../update.mjs';
import { isAbsolutePath, isProjectedVault, MOTOR_MANIFEST, MOTOR_POINTER, readMotorPointer } from './installation.mjs';

export const PROJECTION_STATE = '.cerebro/projection-state.json';
const BACKUPS = '.cerebro/update-backups';
const LOCK = '.cerebro/update.lock';
const SKILL_ROOTS = ['.claude/skills', '.agents/skills'];
const IGNORED_NAMES = new Set(['__pycache__', '.DS_Store', '.pytest_cache']);
const TEMPLATE = 'templates/vault';
const VAULT_SEED_MANIFEST = '.cerebro/vault-seed.manifest';
const LAUNCHER = '.cerebro/bin/cerebro.mjs';
// Regras que só existem por causa da projeção: máquina-específicas, nunca vão para o Git.
const VAULT_IGNORE_RULES = [
  MOTOR_POINTER, PROJECTION_STATE, `${BACKUPS}/`, '.cerebro/update-state.json', LOCK,
];

function projectedFiles(source) {
  const out = [];
  const walk = (dir) => {
    const info = stat(safePath(source, dir));
    if (!info?.isDirectory()) return;
    for (const name of readdirSync(join(source, dir)).sort()) {
      if (IGNORED_NAMES.has(name) || name.endsWith('.pyc')) continue;
      const child = `${dir}/${name}`;
      if (stat(safePath(source, child))?.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  for (const skillsRoot of SKILL_ROOTS) {
    const info = stat(safePath(source, skillsRoot));
    if (!info?.isDirectory()) continue;
    for (const name of readdirSync(join(source, skillsRoot)).sort()) {
      if (IGNORED_NAMES.has(name)) continue;
      if (stat(safePath(source, `${skillsRoot}/${name}`))?.isDirectory()) walk(`${skillsRoot}/${name}`);
    }
  }
  return out;
}

function parseSeeds(source) {
  const text = bytesAt(source, VAULT_SEED_MANIFEST)?.toString('utf8') || '';
  const mapped = new Map(); // destino -> origem
  const plain = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) mapped.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    else plain.push(line);
  }
  return { plain: expandEntries(source, plain), mapped };
}

export const NOT_BRAIN_VAULT = 'not-a-brain-vault: esta pasta não é um vault do Cérebro (sem bloco gerenciado no AGENTS.md, manifesto company-brain nem recibo de projeção). O Cérebro não a projeta nem a religa; ela fica como está.';

/**
 * Plano de projeção do pacote `source` sobre o vault.
 * `fresh`: instalação nova (o vault ainda não existe). Fora disso, o vault precisa ter o ponteiro
 * `.cerebro/motor`: sem ele (ex.: um vault do dono, como o hugo-os) nada é planejado, a menos que
 * `link` (religação explícita, sempre com prévia e hash aprovado) e o vault já tenha sido projetado
 * pelo Cérebro. Religar grava o ponteiro e reprojeta o que já é do produto; nunca planta seeds.
 */
export function planProjection(vault, source, { motorDir, tag, fresh = false, link = false } = {}) {
  if (!TAG_RE.test(tag || '')) throw new Error('explicit-tag-required: use --tag vX.Y.Z');
  if (!isAbsolutePath(motorDir)) throw new Error('motor-dir-absolute-required');
  const root = resolve(vault);
  const motor = resolve(motorDir);
  if (root === motor || root.startsWith(motor + sep) || motor.startsWith(root + sep)) throw new Error('vault-and-motor-must-be-separate');
  if (resolve(source) === root) throw new Error('source-is-destination');
  if (existsSync(join(root, MOTOR_MANIFEST))) throw new Error('vault-is-motor');
  if (!fresh && !readMotorPointer(root)) {
    if (!isProjectedVault(root)) throw new Error(NOT_BRAIN_VAULT);
    if (!link) {
      throw new Error('vault-without-motor-pointer: este vault não tem o ponteiro do motor. Para religar a um motor existente use update.mjs com --vault, --motor e --link');
    }
  }
  const version = bytesAt(source, 'VERSION')?.toString('utf8').trim();
  if (version !== tag.slice(1)) throw new Error('package-version-mismatch');

  const stateBytes = bytesAt(root, PROJECTION_STATE);
  const state = stateBytes ? JSON.parse(stateBytes) : { files: {} };
  if (stateBytes && (state.schema !== 1 || !state.files || typeof state.files !== 'object')) throw new Error('projection-state-invalid');
  const owned = {};
  const changes = new Map();
  const warnings = [];
  const ownsPrefix = prefix => Object.keys(state.files).some(item => item.startsWith(prefix));

  // `check`: 'receipt' = só substitui o que a projeção anterior gravou; 'free' = sem conflito.
  function add(item, incoming, kind, { merge = false, check = 'free', skillDir = null } = {}) {
    const before = bytesAt(root, item);
    const after = merge ? mergeClaude(before, incoming) : incoming;
    const beforeHash = before === null ? null : hash(before);
    const afterHash = hash(after);
    const action = beforeHash === afterHash ? 'unchanged' : before === null ? 'create' : 'replace';
    let conflict = false;
    let reason;
    if (check === 'receipt' && action === 'replace' && state.files[item] !== beforeHash) {
      conflict = true;
      reason = 'edited-locally';
    }
    if (skillDir && action !== 'unchanged' && stat(safePath(root, skillDir)) && !ownsPrefix(`${skillDir}/`)) {
      conflict = true;
      reason = 'skill-folder-owned-by-vault';
    }
    changes.set(item, {
      path: item, kind, action, conflict, ...(reason ? { reason } : {}), beforeHash, afterHash, before, after,
      mode: stat(safePath(root, item))?.mode & 0o777 || 0o644,
    });
    if (!['seed', 'privacy', 'receipt'].includes(kind)) owned[item] = afterHash;
  }

  for (const item of projectedFiles(source)) {
    const skillDir = item.split('/').slice(0, 3).join('/');
    add(item, bytesAt(source, item), 'skill', { check: 'receipt', skillDir });
  }
  const launcher = bytesAt(source, `${TEMPLATE}/${LAUNCHER}`);
  if (!launcher) throw new Error('vault-template-missing: launcher');
  add(LAUNCHER, launcher, 'launcher', { check: 'receipt' });

  const contract = bytesAt(source, `${TEMPLATE}/AGENTS.md`);
  if (!contract) throw new Error('vault-template-missing: AGENTS.md');
  add('AGENTS.md', contract, 'managed', { merge: true });
  for (const name of link ? [] : ['CLAUDE.md', 'GEMINI.md']) {
    const pointer = bytesAt(source, `${TEMPLATE}/${name}`);
    if (pointer && bytesAt(root, name) === null) add(name, pointer, 'seed');
  }

  const ownerClaude = bytesAt(root, 'CLAUDE.md');
  if (ownerClaude && !ownerClaude.toString('utf8').includes('AGENTS.md')) {
    warnings.push('CLAUDE.md existente não cita AGENTS.md: o agente pode não ler o contrato do Cérebro. Adicione ao seu CLAUDE.md uma linha apontando para AGENTS.md (o arquivo não é alterado).');
  }

  add(MOTOR_POINTER, Buffer.from(`MOTOR_DIR=${motor}\nMOTOR_VERSION=${version}\n`), 'pointer');
  add('.cerebro/version', Buffer.from(`${version}\n`), 'pointer');

  const { plain, mapped } = link ? { plain: [], mapped: new Map() } : parseSeeds(source);
  for (const item of plain) {
    if (!changes.has(item) && bytesAt(root, item) === null) add(item, bytesAt(source, item), 'seed');
  }
  for (const [destination, origin] of mapped) {
    const bytes = bytesAt(source, origin);
    if (bytes && !changes.has(destination) && bytesAt(root, destination) === null) add(destination, bytes, 'seed');
  }

  // Regras do dono preservadas; só entram as ausentes.
  const ignore = bytesAt(root, '.gitignore')?.toString('utf8') || '';
  const rules = ['.gitignore', '.cerebro/private-ignore.manifest']
    .flatMap(item => (bytesAt(source, item)?.toString('utf8') || '').split(/\r?\n/))
    .filter(line => line && !line.startsWith('#'));
  rules.push(...VAULT_IGNORE_RULES);
  const present = new Set(ignore.split(/\r?\n/));
  const missing = [...new Set(rules)].filter(rule => !present.has(rule));
  if (missing.length) {
    add('.gitignore', Buffer.from(ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n'), 'privacy');
  }

  add(PROJECTION_STATE, Buffer.from(`${JSON.stringify({
    schema: 1, tag, motor_version: version, files: owned,
  }, null, 2)}\n`), 'receipt');
  safePath(root, LOCK);
  safePath(root, BACKUPS);

  const entries = [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
  const summary = entries.map(({ before, after, ...entry }) => entry);
  const digest = hash(JSON.stringify({ root, motor, tag, entries: summary }));
  return {
    tag, digest, installed: !fresh, fresh, warnings,
    conflicts: summary.filter(entry => entry.conflict).map(entry => entry.path), entries, summary,
  };
}

/** Um plano só para as duas pastas: motor (código) e vault (projeção). */
export function planSplit({ motor, vault, source, tag, baseline = null, fresh = false, link = false }) {
  const motorPlan = planUpdate(motor, source, tag, { baseline, role: 'motor' });
  const vaultPlan = planProjection(vault, source, { motorDir: motor, tag, fresh, link });
  const digest = hash(JSON.stringify({ tag, motor: motorPlan.digest, vault: vaultPlan.digest }));
  const label = (root, plan) => plan.summary.map(entry => ({ root, ...entry }));
  return {
    tag, digest, motorPlan, vaultPlan, warnings: vaultPlan.warnings,
    conflicts: [
      ...motorPlan.conflicts.map(item => `motor:${item}`),
      ...vaultPlan.conflicts.map(item => `vault:${item}`),
    ],
    summary: [...label('motor', motorPlan), ...label('vault', vaultPlan)],
  };
}

/**
 * Aplica o motor e depois o vault. Se o vault falhar, devolve o motor ao estado anterior;
 * `applyPlan` já restaura sozinho o que a própria pasta tinha escrito.
 */
export function applySplit({ motor, vault }, plan, { approvePlan, write } = {}) {
  if (plan.conflicts.length) throw new Error(`update-conflicts: ${plan.conflicts.join(', ')}`);
  if (approvePlan && approvePlan !== plan.digest) throw new Error('plan-changed: preview again');
  const existing = plan.motorPlan.entries.some(entry => entry.action !== 'unchanged' && entry.beforeHash !== null)
    || plan.vaultPlan.installed;
  if (existing && approvePlan !== plan.digest
      && [...plan.motorPlan.entries, ...plan.vaultPlan.entries].some(entry => entry.action !== 'unchanged')) {
    throw new Error('preview-approval-required: use --approve-plan <plan-hash>');
  }
  const options = { approvePlan: approvePlan ? plan.motorPlan.digest : undefined, write };
  const motorBackup = applyPlan(motor, plan.motorPlan, options);
  let vaultBackup = null;
  try {
    vaultBackup = applyPlan(vault, plan.vaultPlan, { ...options, approvePlan: approvePlan ? plan.vaultPlan.digest : undefined });
  } catch (error) {
    if (motorBackup) revertPlan(motor, plan.motorPlan);
    throw error;
  }
  return { motorBackup, vaultBackup };
}
