#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyManagedBrainUpdate,
  buildBrainUpdateCenter,
  checkLatestBrainRelease,
  compareReleaseVersions,
} from './lib/brain-update-center.mjs';

const productRoot = resolve(process.cwd());
const sandbox = mkdtempSync(join(tmpdir(), 'brain-update-center-'));

function write(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, value);
}

function manifest(profile, distribution, versionRef) {
  return JSON.stringify({
    protocol: 'company-brain', manifest_version: 1, profile, distribution,
    version_ref: versionRef, runtime: { mode: profile === 'full' ? 'local-optional' : 'local-required' },
  });
}

try {
  const engine = join(sandbox, 'engine');
  write(join(engine, 'VERSION'), '1.32.0\n');
  write(join(engine, '.cerebro', 'manifest.json'), manifest('full', 'hdoria', 'VERSION'));
  write(join(engine, '.cerebro', 'source'), 'REPO=hdoria/cerebro-hdoria-clean\nBRANCH=main\n');
  write(join(engine, 'CHANGELOG.md'), '# Histórico\n\n## v1.32.0 — 2026-08-24 · “motor local”\n\n- Primeira release observada.\n');
  write(join(engine, 'comunidade', 'vibe-makers', 'atualizacoes', 'feed.v1.json'), `${JSON.stringify({
    protocol_version: 1,
    channel_id: 'product-updates',
    generated_at: '2026-08-28',
    entries: [{
      update_id: 'motor-local-v1-32', kind: 'product-update', title: 'Motor local publicado',
      summary: 'Uma atualização pública e segura para o Cérebro da empresa.',
      published_at: '2026-08-28', release_version: '1.32.0', highlights: [],
    }],
  }, null, 2)}\n`);
  mkdirSync(join(engine, '.git'), { recursive: true });

  const privateBrain = join(sandbox, 'private-brain');
  write(join(privateBrain, '.cerebro', 'manifest.json'), manifest('legacy-compatible', 'private', '.cerebro/version'));
  write(join(privateBrain, '.cerebro', 'version'), '2026.08.24\n');
  const privateCenter = buildBrainUpdateCenter(privateBrain, {
    engineRoot: engine,
    compatibilityPercent: 100,
    communityCounts: { visible: 4, validated: 1, validation: 3, installed: 3 },
    communitySystems: [{
      system_id: 'briefing-comercial', name: 'Briefing Comercial',
      release: { version: '0.1.1', channel: 'pilot' },
      availability: 'validation', installation_status: 'not-installed',
    }],
  });
  assert.equal(privateCenter.installation.version, '2026.08.24');
  assert.equal(privateCenter.installation.profile, 'legacy-compatible');
  assert.equal(privateCenter.installation.update_management, 'unmanaged');
  assert.equal(privateCenter.motor.version, '1.32.0');
  assert.equal(privateCenter.motor.mode, 'development-checkout');
  assert.equal(privateCenter.motor.can_check, true);
  assert.equal(privateCenter.motor.can_apply, false);
  assert.equal(privateCenter.community.visible, 4);
  assert.equal(privateCenter.community.releases[0].system_id, 'briefing-comercial');
  assert.equal(privateCenter.communication.available, true);
  assert.equal(privateCenter.communication.latest.release_version, '1.32.0');
  assert.equal(privateCenter.communication.privacy.company_context_sent, false);

  let requestedUrl = '';
  const remote = await checkLatestBrainRelease(privateCenter, {
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ tag_name: 'v1.33.0', published_at: '2026-08-28T12:00:00.000Z' }),
      };
    },
    clock: () => new Date('2026-08-28T13:00:00.000Z'),
  });
  assert.match(requestedUrl, /releases\/latest$/);
  assert.equal(remote.status, 'update-available');
  assert.equal(remote.metadata_only, true);
  assert.equal(remote.current_version, '1.32.0');

  const managedBrain = join(sandbox, 'managed-brain');
  write(join(managedBrain, 'VERSION'), '1.32.0\n');
  write(join(managedBrain, '.cerebro', 'manifest.json'), manifest('full', 'hdoria', 'VERSION'));
  write(join(managedBrain, '.cerebro', 'source'), 'REPO=hdoria/cerebro-hdoria-clean\nBRANCH=main\n');
  write(join(managedBrain, 'scripts', 'update.mjs'), '// fixture\n');
  const managedCenter = buildBrainUpdateCenter(managedBrain, { engineRoot: managedBrain });
  assert.equal(managedCenter.installation.update_management, 'managed-release');
  assert.equal(managedCenter.motor.can_apply, false);

  await assert.rejects(() => applyManagedBrainUpdate(managedBrain, {
    status: 'update-available', tag: 'v1.33.0', latest_version: '1.33.0', current_version: '1.32.0',
  }), /manual-update-preview-required/);
  assert.equal(readFileSync(join(managedBrain, 'VERSION'), 'utf8'), '1.32.0\n');

  // Instalação dividida: o vault aponta para o motor, que tem atualizador, fonte e versão.
  const splitMotor = join(sandbox, 'split-motor');
  write(join(splitMotor, 'VERSION'), '1.32.0\n');
  write(join(splitMotor, '.cerebro', 'source'), 'REPO=hdoria/cerebro-hdoria-clean\nBRANCH=main\n');
  write(join(splitMotor, 'scripts', 'update.mjs'), '// fixture\n');
  const splitVault = join(sandbox, 'split-vault');
  write(join(splitVault, '.cerebro', 'motor'), `MOTOR_DIR=${splitMotor}\nMOTOR_VERSION=1.32.0\n`);
  write(join(splitVault, '.cerebro', 'version'), '1.32.0\n');
  write(join(splitVault, '.cerebro', 'manifest.json'), manifest('full', 'hdoria', '.cerebro/version'));
  const splitCenter = buildBrainUpdateCenter(splitVault, { engineRoot: splitMotor });
  assert.equal(splitCenter.installation.layout, 'split');
  assert.equal(splitCenter.installation.version, '1.32.0');
  assert.equal(splitCenter.installation.update_management, 'managed-release');
  assert.equal(splitCenter.motor.target_version, '1.32.0');
  mkdirSync(join(splitMotor, '.git'));
  assert.equal(buildBrainUpdateCenter(splitVault, { engineRoot: splitMotor }).installation.reason_code, 'git-checkout-update-protected');
  rmSync(join(splitVault, '.cerebro', 'motor'));
  assert.equal(buildBrainUpdateCenter(splitVault, { engineRoot: splitMotor }).installation.layout, 'legacy');

  assert.equal(compareReleaseVersions('1.33.0', 'v1.33.0'), 0);
  assert.equal(compareReleaseVersions('1.32.0', '1.33.0'), -1);
  assert.equal(compareReleaseVersions('2026.08.24', '1.33.0'), 1);

  const app = readFileSync(join(productRoot, 'console', 'app.js'), 'utf8');
  const css = readFileSync(join(productRoot, 'console', 'styles.css'), 'utf8');
  const server = readFileSync(join(productRoot, 'scripts', 'console-server.mjs'), 'utf8');
  const updater = readFileSync(join(productRoot, 'scripts', 'update.mjs'), 'utf8');
  for (const contract of [
    "['updates', 'Atualizações']",
    'Seu contexto fica. O motor evolui.',
    'Cérebro da empresa',
    'Motor & console',
    'Do motor',
    'Versão do fork',
    'Referência upstream',
    'Cérebro e Sistemas evoluem em trilhas diferentes',
    'Vibe Makers',
    'data-update-check',
    'data-update-apply',
    'Motor entra. Contexto não sai.',
    'strip.scrollLeft = activeMode.offsetLeft',
  ]) assert(app.includes(contract), `interface sem contrato: ${contract}`);
  for (const endpoint of ['/api/update', '/api/update/check', '/api/update/apply']) {
    assert(server.includes(endpoint), `servidor sem endpoint: ${endpoint}`);
  }
  assert(updater.includes('approve-plan') || updater.includes('approvePlan'), 'atualização exige plano aprovado');
  assert(!updater.includes('/releases/latest'), 'aplicação nunca consulta latest novamente');
  for (const selector of ['.brain-mode-bar', '.brain-version-chip', '.brain-update-now', '.brain-news', '.brain-release-board', '.brain-update-grid', '.brain-update-boundary']) {
    assert(css.includes(selector), `estilo ausente: ${selector}`);
  }

  console.log('company-brain-update-center-v1: ok');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
