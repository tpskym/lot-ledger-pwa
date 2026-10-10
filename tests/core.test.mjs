import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculate,portfolioSummary,lifetimeSummary,validateState,validateBackup,finalAmount,parseDecimal,addMonths} from '../dist/core.js';

// Artificial amounts and names. No user backup is used in tests.
const row=(personId,opening,added,rate=1000,carry=false)=>({personId,accumulatedKop:opening*100,addedKop:added*100,withdrawnKop:0,rateBps:rate,carry});
function fixture(){return {
  format:'lot-ledger',version:1,
  people:[{id:'a',name:'Участник А',archived:false},{id:'b',name:'Участник Б',archived:false}],
  lots:[{id:'first',name:'Пример 1'},{id:'second',name:'Пример 2'}],
  periods:[
    {id:'a1',lotId:'first',startDate:'2025-01-01',endDate:'2025-03-01',rows:[row('a',10000,5000),row('b',2000,1000)]},
    {id:'a2',lotId:'first',startDate:'2025-03-02',endDate:'2025-05-02',rows:[row('a',0,1000,1000,true),row('b',0,0,1000,true)]},
    {id:'a3',lotId:'first',startDate:'2025-06-01',endDate:'2025-08-01',rows:[row('a',0,500,1000,true),row('b',0,500,1000,true)]},
    {id:'b1',lotId:'second',startDate:'2025-01-15',endDate:'2025-03-15',rows:[row('a',3000,0,500),row('b',0,0,500)]},
    {id:'b2',lotId:'second',startDate:'2025-03-16',endDate:'2025-05-16',rows:[row('a',0,2000,500,true),row('b',0,0,500,true)]}
  ]
};}
const at='2025-04-01';
test('public initial state is empty and valid',async()=>{
  const seed=JSON.parse(await readFile(new URL('../dist/seed.json',import.meta.url)));
  validateState(seed);
  assert.deepEqual(seed,{format:'lot-ledger',version:1,people:[],lots:[],periods:[]});
  assert.equal(portfolioSummary(seed,'latest',at).totals.finalKop,0);
});
test('opening balances are counted once; current and future contributions differ',()=>{
  const s=validateState(fixture()),current=portfolioSummary(s,'current',at),planned=portfolioSummary(s,'latest',at);
  assert.equal(current.lifetime.openingKop,15000*100);
  assert.equal(current.lifetime.investedKop,24000*100);
  assert.equal(current.totals.finalKop,28287*100);
  assert.equal(current.incomeKop,4287*100);
  assert.equal(planned.lifetime.investedKop,25000*100);
  assert.equal(planned.totals.finalKop,31675*100);
  assert.equal(planned.incomeKop,6675*100);
  assert.equal(lifetimeSummary(s,'current','2024-12-31').investedKop,0);
  s.periods.reverse();
  assert.equal(portfolioSummary(s,'latest',at).totals.finalKop,planned.totals.finalKop);
});
test('all participant metrics sum to portfolio in both modes',()=>{
  const s=fixture();
  for(const mode of ['current','latest']){
    const all=portfolioSummary(s,mode,at),people=s.people.map(p=>portfolioSummary(s,mode,at,p.id));
    assert.equal(people.reduce((n,p)=>n+p.lifetime.investedKop,0),all.lifetime.investedKop);
    assert.equal(people.reduce((n,p)=>n+p.totals.finalKop,0),all.totals.finalKop);
    assert.equal(people.reduce((n,p)=>n+p.incomeKop,0),all.incomeKop);
  }
  const second=portfolioSummary(s,'latest',at,'b');
  assert.equal(second.lifetime.investedKop,3500*100);
  assert.equal(second.totals.finalKop,4543*100);
  assert.equal(second.incomeKop,1043*100);
});
test('interest belongs to the month of period completion',()=>{
  const current=lifetimeSummary(fixture(),'current',at),planned=lifetimeSummary(fixture(),'latest',at);
  assert.equal(current.earnedProfitKop,1950*100);
  assert.deepEqual(planned.months,[
    {month:'2025-03',earnedKop:1950*100,expectedKop:0},
    {month:'2025-05',earnedKop:0,expectedKop:2337*100},
    {month:'2025-08',earnedKop:0,expectedKop:2388*100}
  ]);
});
test('edits propagate through carry and withdrawals affect principal',()=>{
  const s=fixture();s.periods[0].rows[0].addedKop+=2000*100;
  assert.equal(calculate(s).find(p=>p.id==='a3').rows[0].finalKop,24387*100);
  s.periods[1].rows[1].withdrawnKop=1000*100;
  assert.equal(calculate(s).find(p=>p.id==='a2').rows[1].finalKop,2530*100);
  s.periods[1].rows[1].withdrawnKop=99999*100;
  assert.throws(()=>validateState(s),/Вывод/);
});
test('decimal parsing, integer rounding, calendar dates and invalid imports',()=>{
  assert.equal(parseDecimal('1 234,56'),123456);
  assert.equal(finalAmount(10055,800),10800);
  assert.equal(addMonths('2024-12-31'), '2025-02-28');
  assert.throws(()=>parseDecimal('-10'));
  const s=fixture();s.periods[1].startDate='2025-02-28';
  assert.throws(()=>validateState(s),/пересекаться/);
  const backup={backupFormat:'lot-ledger-backup',backupVersion:1,envelope:{state:fixture(),history:[],revision:0}};
  assert.equal(validateBackup(backup).state.people.length,2);
  assert.throws(()=>validateBackup({}));
});
