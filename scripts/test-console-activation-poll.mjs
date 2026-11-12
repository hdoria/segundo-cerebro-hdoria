#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const polling = app.slice(app.indexOf('function scheduleActivationPoll('), app.indexOf('async function performActivationAction('));
const loading = app.slice(app.indexOf('async function loadModel('), app.indexOf('/* Formulário do Decision Case:'));
for (const status of ['running', 'awaiting-confirmation', 'idle', 'completed', 'error']) {
  const timers = [];
  const state = {
    view: 'hermes', initialRouteResolved: true, procedures: {}, skills: {}, vibeMakers: {}, runs: {},
    model: { hermes: { activation: { action: { status } } } },
  };
  let failPoll = false;
  let renders = 0;
  let returnedActivation = null;
  const api = runInNewContext(`${polling}\n${loading}\n({ loadModel, pollActivation })`, {
    state, Promise,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: () => {}, render: () => { renders += 1; }, toast: () => {}, label: (value) => value,
    loadCases: async () => {},
    getJson: async (path) => {
      if (path === '/api/console') return { activation: { complete: false }, hermes: state.model.hermes };
      if (path === '/api/integrations/hermes/activation') {
        if (failPoll) throw new Error('request-failed');
        return returnedActivation || JSON.parse(JSON.stringify(state.model.hermes.activation));
      }
      return { available: false };
    },
  });
  await api.loadModel();
  const active = ['running', 'awaiting-confirmation'].includes(status);
  assert.equal(timers.length, active ? 1 : 0, `reload deve acompanhar ${status} somente enquanto ativo`);
  if (active) {
    failPoll = true;
    await api.pollActivation();
    assert.equal(timers.length, 2, 'falha transitória precisa reagendar a leitura');
    failPoll = false;
    await api.pollActivation();
    assert.equal(timers.length, 3, 'confirmação humana também deve acompanhar expiração');
    assert.equal(renders, 1, 'snapshot idêntico preserva o DOM e o foco dos botões de confirmação');
    returnedActivation = { action: { status, progress: 10 } };
    await api.pollActivation();
    assert.equal(renders, 2, 'mudança de progresso precisa atualizar a tela');
    await api.pollActivation();
    assert.equal(renders, 2, 'snapshot idêntico com progresso ainda preserva o DOM');
  }
}
console.log('✓ acompanhamento da ativação retoma no reload e após falha transitória, e para ao terminar');
