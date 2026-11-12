// Todos os dados de negócio deste fixture são fictícios.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseFrontmatter, sectionBullets, vaultToday } from './lib/vault-today.mjs';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'vault-today-'));
const write = (relative, content) => {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
const note = (meta, body) => `---\n${meta}\n---\n\n${body}\n`;
const config = { focus: ['hot.md', 'home.md'], daily: 'journal', inbox: 'inbox', projects: 'projects', areas: 'areas', staleDays: 7 };
const now = new Date('2035-09-30T15:00:00Z');

try {
  assert.deepEqual(parseFrontmatter(note('type: Project\ntags: [a, b]\nbelongs_to:\n  - "[[empresa-ficticia-alfa]]"', '# X')),
    { type: 'Project', tags: ['a', 'b'], belongs_to: ['[[empresa-ficticia-alfa]]'] });
  assert.deepEqual(sectionBullets('# H\n\n## Foco agora\n\n- Um [[conteudo|Conteúdo]]\n- Dois → [[empresa-ficticia-alfa]]\n\n## Outra\n- fora', 'Foco agora'),
    ['Um Conteúdo', 'Dois → empresa-ficticia-alfa']);

  write('home.md', note('type: Note', '# Home\n\n## Foco agora\n\n- Organizar amostras fictícias → [[conteudo]]\n\n## Áreas\n- [[empresa-ficticia-alfa]]'));
  write('areas/empresa-ficticia-alfa.md', note('type: Area\nstatus: Active', '# Empresa Fictícia Alfa'));
  write('areas/escola-ficticia-beta.md', note('type: Area\nstatus: Active', '# Escola Fictícia Beta'));
  write('projects/novo.md', note('type: Project\nstatus: Active\nupdated: 2035-09-28\nbelongs_to:\n  - "[[empresa-ficticia-alfa]]"', '# Projeto novo'));
  write('projects/velho.md', note('type: Project\nstatus: Active\nupdated: 2035-08-01\nrelated_to:\n  - "[[empresa-ficticia-alfa]]"', '# Projeto velho'));
  write('projects/sem-data.md', note('type: Project\nstatus: Active', '# Sem data'));
  write('projects/feito.md', note('type: Project\nstatus: Done\nupdated: 2035-01-01\nbelongs_to:\n  - "[[escola-ficticia-beta]]"', '# Feito'));
  write('journal/2035-09-29.md', note('type: Note', '# 2035-09-29\n\n## Prioridades\n\n1. Catalogar amostras fictícias\n2. [ ] Revisar [[novo]]\n\n## Agenda\n- 14h demonstração fictícia'));
  write('journal/2035-W39-review.md', note('type: Note', '# Weekly'));
  write('inbox/captura.md', '# Captura\n');

  const result = vaultToday(root, config, { now });
  assert.equal(result.available, true);
  assert.deepEqual(result.focus, { ref: 'home.md', items: ['Organizar amostras fictícias → conteudo'] }, 'sem hot.md, o foco cai no home.md');
  assert.deepEqual(result.daily, { date: '2035-09-29', ref: 'journal/2035-09-29.md', is_today: false, priorities: ['Catalogar amostras fictícias', 'Revisar novo'] },
    'a daily mais recente vale, ignorando a weekly');
  assert.deepEqual(result.inbox, { ref: 'inbox', count: 1 });
  assert.equal(result.projects.active, 3, 'Done não conta como ativo');
  assert.deepEqual(result.projects.stale.map((project) => [project.slug, project.days]), [['sem-data', null], ['velho', 60]],
    'parado = ativo sem updated ou com updated há 7+ dias');
  assert.deepEqual(result.areas.map((area) => [area.slug, area.active_projects]), [['empresa-ficticia-alfa', 2], ['escola-ficticia-beta', 0]],
    'área conta projetos ativos ligados por belongs_to ou related_to');

  write('hot.md', note('type: Note', '# Hot\n\n- Fechar Projeto Fictício Gama\n- Preparar demonstração fictícia'));
  assert.deepEqual(vaultToday(root, config, { now }).focus, { ref: 'hot.md', items: ['Fechar Projeto Fictício Gama', 'Preparar demonstração fictícia'] }, 'hot.md tem prioridade');

  assert.equal(vaultToday(root, undefined).available, false, 'sem a chave vault, o modo fica desligado');
  const escaped = vaultToday(root, { ...config, projects: '../', focus: ['../../etc/hosts'] }, { now });
  assert.equal(escaped.projects.active, 0, 'pasta fora do Cérebro é ignorada');
  assert.equal(escaped.focus.ref, null, 'foco fora do Cérebro é ignorado');

  console.log('✓ vault-today lê foco, daily, parados, inbox e áreas sem sair do Cérebro');
} finally {
  rmSync(root, { recursive: true, force: true });
}
