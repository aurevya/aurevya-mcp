const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
eval([
 grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),
 grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeBlocks\(rows\)\{[\s\S]*?\n\}/),
 grab(/function feeUnitAt\(list,idx\)\{[\s\S]*?\n\}/),
 grab(/function feeNeighbourUnit\(list,u,dir\)\{[\s\S]*?\n\}/),
 grab(/function feeListFor\(which,ci\)\{[\s\S]*?\n\}/),
 grab(/function moveFeeRow\(which,ci,idx,dir\)\{[\s\S]*?\n\}/),
].join('\n').replace(/^const /gm,'var '));
global.renderFeeEditor=()=>{}; global.liveBuild=()=>{};
global.STATE={fees:{setup:[],fixed:[]},feeCols:[]};

let fails=0;
const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
const sig=list=>list.map(r=>r.t==='grp'?'['+r.l.slice(0,14)+']':(r.t==='item'?r.l.slice(0,16):'  ·'+r.l.slice(0,14))).join(' ');
const blockSig=list=>feeBlocks(list).map(b=>(b.grp||'(none)').slice(0,12)+':'+
  b.items.map(i=>i.lines.length).join(',')).join(' | ');

/* a real list, with description lines and several groups */
STATE.fees.setup=composeFees(['ac','cis','trust'],'setup');
const L=()=>STATE.fees.setup;
console.log('rows:',L().length,'  groups:',L().filter(r=>r.t==='grp').length);
console.log('start:',blockSig(L()),'\n');

/* 1. a priced line with description rows keeps them */
const before=blockSig(L());
const itemIdx=L().findIndex(r=>r.t==='item'&&L()[L().indexOf(r)-1]&&L()[L().indexOf(r)-1].t==='desc');
const multi=L().map((r,i)=>({r,i})).filter(x=>x.r.t==='item'&&L()[x.i-1]&&(L()[x.i-1].t==='desc'||L()[x.i-1].t==='sub'))[0];
if(multi){
  const label=multi.r.l, descCount=(()=>{let n=0,i=multi.i-1;while(i>=0&&(L()[i].t==='desc'||L()[i].t==='sub')){n++;i--;}return n;})();
  moveFeeRow('setup',null,multi.i,-1);
  const nowIdx=L().findIndex(r=>r.t==='item'&&r.l===label);
  let n=0,i=nowIdx-1; while(i>=0&&(L()[i].t==='desc'||L()[i].t==='sub')){n++;i--;}
  ok('a priced line carries its description rows', n===descCount, `${descCount} before, ${n} after`);
  moveFeeRow('setup',null,nowIdx,1);
  ok('and moving it back restores the original order', blockSig(L())===before);
}

/* 2. every row count is preserved no matter how much we shuffle */
const n0=L().length, total0=L().filter(r=>r.t==='item').reduce((a,r)=>a+(r.v||0),0);
for(let k=0;k<300;k++){
  const i=Math.floor(Math.random()*L().length);
  moveFeeRow('setup',null,i,Math.random()<0.5?-1:1);
}
const total1=L().filter(r=>r.t==='item').reduce((a,r)=>a+(r.v||0),0);
ok('300 random moves lose no rows', L().length===n0, `${n0} -> ${L().length}`);
ok('and change no figures', total0===total1, `${total0} -> ${total1}`);
/* A description CAN now end up after the last price — each row moves on
   its own. What matters is that it still reaches the page rather than
   being silently dropped, which is what feeBlocks' orphan case is for. */
const printedAll=feeBlocks(L()).flatMap(b=>b.items).flatMap(i=>i.lines).map(l=>l.l);
ok('every line still reaches the page after shuffling',
   L().filter(r=>r.t!=='grp').every(r=>printedAll.includes(r.l)),
   printedAll.length+' lines printed');

/* 3. groups move as a whole */
STATE.fees.setup=composeFees(['ac','cis','trust'],'setup');
const grps=()=>L().filter(r=>r.t==='grp').map(r=>r.l);
const g0=grps().slice();
const secondGrp=L().findIndex((r,i)=>r.t==='grp'&&L().slice(0,i).some(x=>x.t==='grp'));
moveFeeRow('setup',null,secondGrp,-1);
const g1=grps();
ok('moving a heading swaps whole groups',
   g1[0]===g0[1]&&g1[1]===g0[0], g0.slice(0,2).join(' , ')+'  ->  '+g1.slice(0,2).join(' , '));
ok('the group keeps its own lines',
   feeBlocks(L()).find(b=>b.grp===g0[1]).items.length===
   feeBlocks(composeFees(['ac','cis','trust'],'setup')).find(b=>b.grp===g0[1]).items.length);

/* 4. an item can walk across a heading into the next group */
STATE.fees.setup=composeFees(['ac','cis'],'setup');
const firstGrpEnd=L().findIndex((r,i)=>r.t==='grp'&&i>0);
const lastOfFirst=firstGrpEnd-1;
const movingLabel=L()[lastOfFirst].l;
moveFeeRow('setup',null,lastOfFirst,1);   // hop below the heading
const bl=feeBlocks(L());
ok('a line can be moved into the following group',
   bl[1].items.some(i=>i.lines.some(l=>l.l===movingLabel)),
   '"'+String(movingLabel).slice(0,28)+'" now under "'+bl[1].grp.slice(0,20)+'"');

/* 5. edges */
STATE.fees.setup=composeFees(['ac'],'setup');
const len=L().length;
moveFeeRow('setup',null,0,-1);
ok('moving the first row up is a no-op', L().length===len);
moveFeeRow('setup',null,L().length-1,1);
ok('moving the last row down is a no-op', L().length===len);

console.log(fails?`\n${fails} FAILURES`:'\nreordering preserves every row, figure and description');
process.exit(fails?1:0);
