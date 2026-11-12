#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { applyPlan, hash, planUpdate } from './update.mjs';
import { installPackage } from './install.mjs';
const product = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(join(product, 'VERSION'), 'utf8').trim();
const tag = `v${version}`;
const sandbox = mkdtempSync(join(tmpdir(), 'community-release-'));
const guides = ['docs/guides/community-mcp.md', 'docs/guides/community-systems.md', 'docs/guides/community-release.md', 'docs/guides/implantacao-assistida.md'].filter((path) => existsSync(join(product, path)));
const releaseNotes = ['docs/releases/1.38.0.md', 'docs/releases/1.39.0.md', 'docs/releases/1.39.1.md', 'docs/releases/1.40.0.md'].filter((path) => existsSync(join(product, path)));
const preparationReferences = ['.agents/skills/comecar/references/implantacao.md', '.claude/skills/comecar/references/implantacao.md'].filter((path) => existsSync(join(product, path)));
const distributedDocs = [...guides, ...releaseNotes, ...preparationReferences];

// Older releases are rebuilt from the tracked tree so the suite never fetches another repository.
function writeSyntheticBaseline(target, baselineVersion) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: product, maxBuffer: 100 * 1024 * 1024 })
    .toString().split('\0').filter(Boolean);
  for (const path of tracked) {
    if (!existsSync(join(product, path))) continue;
    mkdirSync(dirname(join(target, path)), { recursive: true });
    cpSync(join(product, path), join(target, path));
  }
  writeFileSync(join(target, 'VERSION'), `${baselineVersion}\n`);
  rmSync(join(target, 'docs/guides/implantacao-assistida.md'), { force: true });
  writeFileSync(join(target, 'docs/guides/community-mcp.md'), `# guia ${baselineVersion}\n`);
  const managed = /(<!-- CEREBRO:MANAGED:BEGIN -->)[\s\S]*?(<!-- CEREBRO:MANAGED:END -->)/;
  // Instalações antigas (pasta única) tinham o contrato no CLAUDE.md; hoje ele vem do template do vault.
  const contract = readFileSync(join(target, 'templates/vault/AGENTS.md'), 'utf8');
  writeFileSync(join(target, 'CLAUDE.md'), contract.replace(managed, '$1\nregra gerenciada antiga\n$2'));
}

try {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(guides.includes('docs/guides/community-mcp.md'));
  const fresh = { vault: join(sandbox, 'fresh', 'notas'), motor: join(sandbox, 'fresh', 'motor') };
  assert.equal(installPackage(fresh, product, tag).written, false);
  assert.equal(existsSync(fresh.motor), false);
  installPackage(fresh, product, tag, { apply: true });
  for (const path of distributedDocs) assert.deepEqual(readFileSync(join(fresh.motor, path)), readFileSync(join(product, path)));
  const help = execFileSync(process.execPath, [join(fresh.motor, 'scripts/community.mjs'), '--help'], { encoding: 'utf8' });
  assert.match(help, /--sha256/);
  const receipts = [];
  for (const baselineVersion of ['1.38.0', '1.39.0', '1.39.1']) {
    const baseline = join(sandbox, `baseline-${baselineVersion}`); mkdirSync(baseline);
    writeSyntheticBaseline(baseline, baselineVersion);
    assert.equal(readFileSync(join(baseline, 'VERSION'), 'utf8').trim(), baselineVersion);
    const member = join(sandbox, `member-${baselineVersion}`); cpSync(baseline, member, { recursive: true });
    const sentinels = {
      'meu-negocio/oferta.md': 'PRIVATE_OFFER', '.cerebro/install-credential': 'PRIVATE_CREDENTIAL',
      '.cerebro/id': 'LOCAL_ID', '.cerebro/sistemas/custom.json': '{"private":true}',
      'sistemas/outros-instalados/funil-e-crescimento/workspace/contexto/empresa.md': 'PRIVATE_WORKSPACE',
      'comunidade/minhas-contribuicoes/propostas/local/package.json': '{"private":true}',
      '.agents/skills/minha-skill/SKILL.md': 'MY_SKILL',
    };
    for (const [path, value] of Object.entries(sentinels)) { mkdirSync(dirname(join(member, path)), { recursive: true }); writeFileSync(join(member, path), value); }
    const claude = `${readFileSync(join(member, 'CLAUDE.md'), 'utf8')}\nREGRA PRIVADA DO DONO\n`; writeFileSync(join(member, 'CLAUDE.md'), claude);
    const sourceBefore = readFileSync(join(member, '.cerebro/source'), 'utf8');
    const plan = planUpdate(member, product, tag, { baseline });
    assert.deepEqual(plan.conflicts, []);
    for (const path of guides) {
      const expected = !existsSync(join(baseline, path)) ? 'create'
        : readFileSync(join(baseline, path)).equals(readFileSync(join(product, path))) ? 'unchanged' : 'replace';
      assert(plan.entries.some((entry) => entry.path === path && entry.action === expected), `guia omitido: ${path}`);
    }
    assert.equal(readFileSync(join(member, 'VERSION'), 'utf8').trim(), baselineVersion);
    applyPlan(member, plan, { approvePlan: plan.digest });
    assert.equal(readFileSync(join(member, 'VERSION'), 'utf8').trim(), version);
    for (const [path, value] of Object.entries(sentinels)) assert.equal(readFileSync(join(member, path), 'utf8'), value);
    // O bloco gerenciado recebe a nova orientação; a regra privada permanece byte a byte.
    const updatedClaude = readFileSync(join(member, 'CLAUDE.md'), 'utf8');
    const productClaude = readFileSync(join(product, 'templates/vault/AGENTS.md'), 'utf8');
    if (productClaude.includes('<!-- CEREBRO:MANAGED:BEGIN -->')) {
      const managed = /<!-- CEREBRO:MANAGED:BEGIN -->[\s\S]*?<!-- CEREBRO:MANAGED:END -->/;
      assert.equal(updatedClaude.match(managed)?.[0], productClaude.match(managed)?.[0]);
      assert.equal(updatedClaude.replace(managed, ''), claude.replace(managed, ''),
        'regras fora do bloco pertencem ao membro, inclusive quando o pacote traz regras próprias');
    } else {
      assert.ok(updatedClaude.includes('REGRA PRIVADA DO DONO'));
      assert.ok(updatedClaude.includes('<!-- CEREBRO:MANAGED:BEGIN -->'));
    }
    const repoLine = (text) => text.split('\n').find((line) => line.startsWith('REPO='));
    assert.equal(repoLine(readFileSync(join(member, '.cerebro/source'), 'utf8')), repoLine(sourceBefore));
    for (const path of distributedDocs) assert.deepEqual(readFileSync(join(member, path)), readFileSync(join(product, path)));
    const replay = planUpdate(member, product, tag); assert.deepEqual(replay.conflicts, []); assert.equal(applyPlan(member, replay), null);
    receipts.push({ baseline: baselineVersion, private_sentinels_preserved: Object.keys(sentinels).length, local_claude_preserved: true, channel_unchanged: true, idempotent: true });
  }
  console.log(JSON.stringify({ status: 'passed', version, installed_guides: guides.length, installed_release_notes: releaseNotes.length, upgrades: receipts }));
} finally { rmSync(sandbox, { recursive: true, force: true }); }
