export const FORMAT = 'lot-ledger';
export const VERSION = 1;
export function today() { return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addMonths(date, months=2) {
  const [y,m,d]=date.split('-').map(Number); const end=new Date(Date.UTC(y,m-1+months+1,0));
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,end.getUTCDate())).padStart(2,'0')}`;
}
export function parseDecimal(value, scale=100) {
  const s=String(value).trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Введите неотрицательное число, не более двух знаков после запятой.');
  const [whole,part='']=s.split('.'); const n=Number(whole)*scale+Number(part.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n>100000000000000) throw new Error('Сумма слишком большая.');
  return n;
}
export function finalAmount(principalKop,rateBps) {
  if(!Number.isSafeInteger(principalKop)||principalKop<0) throw new Error('Вывод не может превышать накопления и пополнение.');
  if(!Number.isSafeInteger(rateBps)||rateBps<0||rateBps>1000000) throw new Error('Ставка должна быть от 0 до 10 000%.');
  const result=Number((BigInt(principalKop)*BigInt(10000+rateBps)/1000000n)*100n);
  if(!Number.isSafeInteger(result)||result>100000000000000) throw new Error('Результат расчёта слишком большой.');
  return result;
}
export function clone(value) { return structuredClone(value); }
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateState(s) {
  if(!s||s.format!==FORMAT||s.version!==VERSION) throw new Error('Неподдерживаемый формат резервной копии.');
  if(!Array.isArray(s.people)||!Array.isArray(s.lots)||!Array.isArray(s.periods)) throw new Error('В копии отсутствуют люди, лоты или периоды.');
  if(s.people.length>1000||s.lots.length>1000||s.periods.length>10000) throw new Error('В копии слишком много записей.');
  for(const list of [s.people,s.lots,s.periods]) {
    const ids=new Set();for(const x of list){if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id))throw new Error('Некорректные или повторяющиеся идентификаторы.');ids.add(x.id);}
  }
  for(const p of [...s.people,...s.lots]) if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120) throw new Error('Некорректное имя.');
  for(const p of s.people) if(typeof p.archived!=='boolean'||(p.note!==undefined&&typeof p.note!=='string'))throw new Error('Некорректный участник.');
  const people=new Set(s.people.map(p=>p.id)),lots=new Set(s.lots.map(l=>l.id));
  for(const p of s.periods) {
    if(!lots.has(p.lotId)||!validDate(p.startDate)||!validDate(p.endDate)||p.endDate<=p.startDate||!Array.isArray(p.rows))throw new Error('Некорректный период или даты.');
    if(p.note!==undefined&&(typeof p.note!=='string'||p.note.length>5000))throw new Error('Некорректная заметка.');
    const ids=new Set();for(const r of p.rows) {
      if(!people.has(r.personId)||ids.has(r.personId)||typeof r.carry!=='boolean')throw new Error('Некорректный участник периода.');ids.add(r.personId);
      for(const k of ['accumulatedKop','addedKop','withdrawnKop','rateBps'])if(!Number.isSafeInteger(r[k])||r[k]<0||r[k]>100000000000000)throw new Error('Некорректные суммы или ставка.');
      if(r.rateBps>1000000)throw new Error('Ставка слишком большая.');
    }
  }
  for(const l of s.lots){const ps=s.periods.filter(p=>p.lotId===l.id).sort((a,b)=>a.startDate.localeCompare(b.startDate));for(let i=1;i<ps.length;i++)if(ps[i].startDate<=ps[i-1].endDate)throw new Error('Периоды одного лота не должны пересекаться.');}
  calculate(s);return s;
}
export function calculate(state) {
  const result=[];
  for(const lot of state.lots) {
    let previous=null;
    for(const p of state.periods.filter(x=>x.lotId===lot.id).sort((a,b)=>a.startDate.localeCompare(b.startDate))) {
      const rows=p.rows.map(r=>{
        const accumulatedKop=r.carry&&previous?(previous.rows.find(x=>x.personId===r.personId)?.finalKop||0):r.accumulatedKop;
        const principalKop=accumulatedKop+r.addedKop-r.withdrawnKop;
        const finalKop=finalAmount(principalKop,r.rateBps);
        return {...r,accumulatedKop,principalKop,finalKop,profitKop:finalKop-principalKop};
      });
      const totals={accumulatedKop:0,addedKop:0,withdrawnKop:0,principalKop:0,finalKop:0,profitKop:0};
      for(const r of rows)for(const k of Object.keys(totals))totals[k]+=r[k];
      previous={...p,rows,totals};result.push(previous);
    }
  }
  return result;
}
export function selectedPeriods(state,mode='current',date=today()) {
  const all=calculate(state);
  return state.lots.map(l=>all.filter(p=>p.lotId===l.id&&(mode==='latest'||p.startDate<=date)).sort((a,b)=>b.startDate.localeCompare(a.startDate))[0]).filter(Boolean);
}
export function sumPeriods(periods,personId) {
  const keys=['accumulatedKop','addedKop','withdrawnKop','principalKop','finalKop','profitKop']; const totals=Object.fromEntries(keys.map(k=>[k,0]));
  for(const p of periods){const r=personId?p.rows.find(r=>r.personId===personId):p.totals;if(r)for(const k of keys)totals[k]+=r[k];}return totals;
}
export function lifetimeSummary(state,mode='current',at=today(),personId) {
  const all=calculate(state);
  // Count each lot's opening balance once, then add new contributions.
  const contributionPeriods=all.filter(p=>mode==='latest'||p.startDate<=at);
  const openingPeriods=state.lots.map(l=>contributionPeriods.find(p=>p.lotId===l.id)).filter(Boolean);
  const openingKop=sumPeriods(openingPeriods,personId).accumulatedKop;
  const addedKop=sumPeriods(contributionPeriods,personId).addedKop;
  const earned=all.filter(p=>p.endDate<=at);
  const includedIncome=mode==='latest'?all:earned;
  const months=new Map();
  for(const p of includedIncome) {
    const month=p.endDate.slice(0,7);
    if(!months.has(month))months.set(month,{month,earnedKop:0,expectedKop:0});
    months.get(month)[p.endDate<=at?'earnedKop':'expectedKop']+=personId?(p.rows.find(r=>r.personId===personId)?.profitKop||0):p.totals.profitKop;
  }
  const earnedProfitKop=sumPeriods(earned,personId).profitKop;
  const profitKop=sumPeriods(includedIncome,personId).profitKop;
  return {openingKop,addedKop,investedKop:openingKop+addedKop,profitKop,earnedProfitKop,expectedProfitKop:profitKop-earnedProfitKop,months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month))};
}
export function portfolioSummary(state,mode='current',at=today(),personId) {
  const periods=selectedPeriods(state,mode,at);
  const totals=sumPeriods(periods,personId);
  const lifetime=lifetimeSummary(state,mode,at,personId);
  return {periods,totals,lifetime,incomeKop:totals.finalKop-lifetime.investedKop};
}
export function initialEnvelope(state) { return {state:validateState(state),history:[],revision:0}; }
export function validateBackup(value) {
  if(value?.backupFormat!=='lot-ledger-backup'||value.backupVersion!==1||!value.envelope)throw new Error('Выберите JSON-копию, созданную этим приложением.');
  const e=value.envelope; validateState(e.state);
  if(!Array.isArray(e.history)||e.history.length>20000)throw new Error('Некорректный журнал истории.');
  const ids=new Set();for(const h of e.history){if(!h||typeof h.id!=='string'||ids.has(h.id)||typeof h.label!=='string'||typeof h.at!=='string'||isNaN(Date.parse(h.at)))throw new Error('Некорректная запись истории.');ids.add(h.id);if(h.before)validateState(h.before);if(h.after)validateState(h.after);}
  return e;
}
