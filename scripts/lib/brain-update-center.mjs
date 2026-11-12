import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCommunicationReadModel } from './communication-feed.mjs';
import { TAG_RE } from '../update.mjs';
import { brainVersion, readMotorPointer } from './installation.mjs';

const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BASELINE_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

function readText(path) {
  try { return readFileSync(path, 'utf8').trim(); } catch { return null; }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function safeRef(root, ref) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const path = resolve(root, ref);
  const rel = relative(resolve(root), path);
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) return null;
  return path;
}

function source(root) {
  const value = readText(join(root, '.cerebro', 'source')) || '';
  const field = (name) => value.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || null;
  const repo = field('REPO');
  return {
    repo: REPO_RE.test(repo || '') ? repo : null,
    branch: field('BRANCH') || 'main',
  };
}

function descriptor(root) {
  const manifest = readJson(join(root, '.cerebro', 'manifest.json')) || {};
  const versionPath = safeRef(root, manifest.version_ref) || join(root, 'VERSION');
  const fallback = readText(join(root, '.cerebro', 'version'));
  return {
    profile: manifest.profile || (existsSync(join(root, '.cerebro', 'legacy-brain.json')) ? 'legacy-compatible' : 'unmanifested'),
    distribution: manifest.distribution || 'private',
    manifest_version: manifest.manifest_version || null,
    runtime_mode: manifest.runtime?.mode || null,
    version: readText(versionPath) || fallback || 'não versionado',
  };
}

function upstreamBaseline(engineRoot) {
  const unavailable = (status) => ({ status, runtime_verified: false });
  let value;
  try {
    const directory = join(engineRoot, '.cerebro');
    if (lstatSync(directory).isSymbolicLink()) return unavailable('invalid');
    const path = join(directory, 'upstream-baseline.json');
    const info = lstatSync(path);
    if (!info.isFile() || info.size > 16_384) return unavailable('invalid');
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return unavailable(error.code === 'ENOENT' ? 'missing' : 'invalid');
  }
  const selection = (items) => Array.isArray(items) && items.length <= 32
    && items.every((item) => typeof item === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(item));
  if (!value || value.schema_version !== 1
      || typeof value.repo !== 'string' || !BASELINE_REPO_RE.test(value.repo)
      || typeof value.tag !== 'string' || value.tag.length > 80 || !TAG_RE.test(value.tag)
      || typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.commit)
      || value.integration !== 'selective' || !selection(value.included) || !selection(value.excluded)) {
    return unavailable('invalid');
  }
  // This local declaration records selection; it does not attest runtime behavior or parity.
  return {
    status: 'recorded', runtime_verified: false,
    schema_version: value.schema_version, repo: value.repo, tag: value.tag, commit: value.commit,
    integration: value.integration, included: value.included, excluded: value.excluded,
  };
}

function versionParts(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareReleaseVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return String(left) === String(right) ? 0 : null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function buildBrainUpdateCenter(brainRoot, {
  engineRoot = PRODUCT_ROOT,
  compatibilityPercent = null,
  communityCounts = {},
  communitySystems = [],
} = {}) {
  const root = resolve(brainRoot);
  const engine = resolve(engineRoot);
  // Instalação dividida: o vault aponta para o motor, que é quem tem atualizador, fonte e versão.
  const pointer = readMotorPointer(root);
  const installedMotor = pointer ? pointer.motorDir : root;
  const installation = { ...descriptor(root), layout: pointer ? 'split' : 'legacy' };
  if (pointer) installation.version = brainVersion(root) || installation.version;
  const motor = descriptor(engine);
  const targetSource = source(installedMotor);
  const motorSource = source(engine);
  const targetUpdater = join(installedMotor, 'scripts', 'update.mjs');
  const targetIsCheckout = existsSync(join(installedMotor, '.git'));
  const managed = (pointer ? Boolean(brainVersion(root)) : existsSync(join(root, 'VERSION')))
    && existsSync(targetUpdater)
    && Boolean(targetSource.repo)
    && !targetIsCheckout;
  const checkSource = targetSource.repo ? targetSource : motorSource;
  const systemReleases = communitySystems
    .filter((system) => system && typeof system.system_id === 'string'
      && typeof system.name === 'string' && typeof system.release?.version === 'string')
    .map((system) => ({
      system_id: system.system_id,
      name: system.name,
      version: system.release.version,
      channel: typeof system.release.channel === 'string' ? system.release.channel : null,
      availability: typeof system.availability === 'string' ? system.availability : null,
      installation_status: typeof system.installation_status === 'string' ? system.installation_status : null,
    }));

  return {
    generated_at: new Date().toISOString(),
    installation: {
      ...installation,
      compatibility_percent: Number.isFinite(compatibilityPercent) ? compatibilityPercent : null,
      update_management: managed ? 'managed-release' : 'unmanaged',
      reason_code: managed ? null
        : targetIsCheckout ? 'git-checkout-update-protected'
          : !targetSource.repo ? 'update-source-not-configured'
            : !existsSync(targetUpdater) ? 'local-updater-missing' : 'installation-version-missing',
    },
    motor: {
      version: motor.version,
      fork_version: motor.version,
      upstream_baseline: upstreamBaseline(engine),
      mode: existsSync(join(engine, '.git')) ? 'development-checkout' : 'packaged-release',
      source: { repo: checkSource.repo, branch: checkSource.branch },
      can_check: Boolean(checkSource.repo),
      // A UI ainda não apresenta o plano/hash; aplicar daqui violaria a prévia obrigatória.
      can_apply: false,
      target_version: managed ? installation.version : motor.version,
    },
    community: {
      distribution_version: motor.version,
      visible: Number(communityCounts.visible) || 0,
      validated: Number(communityCounts.validated) || 0,
      validation: Number(communityCounts.validation) || 0,
      installed: Number(communityCounts.installed) || 0,
      update_mode: 'bundled-with-motor',
      releases: systemReleases,
    },
    communication: buildCommunicationReadModel(engine),
    protection: {
      context_uploaded: false,
      automatic_check: false,
      owner_paths_preserved: true,
      update_requires_confirmation: true,
    },
  };
}

export async function checkLatestBrainRelease(center, {
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
} = {}) {
  const repo = center?.motor?.source?.repo;
  if (!REPO_RE.test(repo || '')) throw new Error('update-channel-unmanaged');
  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { 'User-Agent': 'company-brain-console', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('update-check-unavailable');
  }
  if (!response?.ok) throw new Error('update-check-unavailable');
  const release = await response.json();
  const tag = release?.tag_name;
  if (!TAG_RE.test(tag || '')) throw new Error('update-release-invalid');
  const latestVersion = tag.replace(/^v/, '');
  const comparison = compareReleaseVersions(center.motor.target_version, latestVersion);
  const status = comparison === null ? 'comparison-unavailable'
    : comparison < 0 ? 'update-available' : comparison > 0 ? 'ahead' : 'current';
  return {
    status,
    tag,
    latest_version: latestVersion,
    current_version: center.motor.target_version,
    published_at: typeof release.published_at === 'string' ? release.published_at : null,
    checked_at: clock().toISOString(),
    metadata_only: true,
  };
}

export async function applyManagedBrainUpdate() {
  throw new Error('manual-update-preview-required');
}
