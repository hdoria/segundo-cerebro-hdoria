#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const app = readFileSync(new URL('../console/app.js',import.meta.url),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const renders=[]; let release;
const state={selectedRoutine:null,selectedJudgment:null,judgmentReview:null,judgmentRequest:0,deliveryApplication:{clear(){}},model:{judgments:[]}};
const deps={state,$:()=>({}),renderMarkup:(_target,markup)=>renders.push(markup),drawerController:{open(){}},getJson:()=>new Promise(resolve=>{release=resolve;}),loadContext:async()=>{}};
const openJudgment=runInNewContext(`(${section('async function openJudgment(', '\nasync function performJudgment(')})`,deps);
const openContext=runInNewContext(`(${section('async function openContextDrawer(', '\nfunction judgmentVersionMarkup(')})`,deps);
const old=openJudgment('receipt-demo');
await openContext('receipt-demo');
assert.match(renders.at(-1),/Contexto selecionado/);
const count=renders.length;release({});await old;
assert.equal(renders.length,count,'late output cannot replace the context drawer of the same receipt');
console.log('✓ drawer instance guards preserve same-receipt context against stale output responses');
