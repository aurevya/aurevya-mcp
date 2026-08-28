/* Drives the real drag handlers against a jsdom table built by the real
   renderFeeEditor, then checks the underlying array actually moved. */
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
const dom=new JSDOM('<table><tbody id="feeSetup"></tbody></table><table><tbody id="feeFixed"></tbody></table>');
global.window=dom.window; global.document=dom.window.document;
global.HTMLElement=dom.window.HTMLElement;

eval([
 grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),
 grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeBlocks\(rows\)\{[\s\S]*?\n\}/),
 grab(/function feeEditorRow\(r,path,del,mv\)\{[\s\S]*?\n\}/),
 grab(/function feeUnitAt\(list,idx\)\{[\s\S]*?\n\}/),
 grab(/function feeListFor\(which,ci\)\{[\s\S]*?\n\}/),
 grab(/function moveFeeUnit\(which,ci,fromIdx,overIdx,after\)\{[\s\S]*?\n\}/),
 grab(/let FEE_DRAG=null;/),
 grab(/function wireFeeDrag\(tb\)\{[\s\S]*?\n\}/),
 grab(/function rowsTotal\(rows\)\{[\s\S]*?\n\}/),
 grab(/function renderFeeEditor\(\)\{[\s\S]*?\n\}/),
].join('\n').replace(/^const /gm,'var ').replace(/^let FEE_DRAG/m,'var FEE_DRAG'));

global.$=id=>document.getElementById(id);
global.liveBuild=()=>{}; global.feeTotals=()=>{}; global.curSym=()=>'US$'; global.money=v=>String(v);
global.STATE={fees:{setup:composeFees(['ac','cis'],'setup'),fixed:[]},feeCols:[]};

let fails=0;
const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
const labels=()=>STATE.fees.setup.map(r=>r.l);

renderFeeEditor();
const tb=$('feeSetup');
const rows=()=>[...tb.querySelectorAll('tr.feerow')];
ok('every fee row is draggable-tagged', rows().length===STATE.fees.setup.length,
   rows().length+' of '+STATE.fees.setup.length);
ok('each row carries its list and index',
   rows().every((tr,i)=>tr.dataset.idx===String(i)&&tr.dataset.ci===''&&tr.dataset.which==='setup'));
ok('each row has a grab handle', rows().every(tr=>tr.querySelector('.feeGripCell')));

/* the handle arms the row; the row is not draggable before that */
const tr3=rows()[3];
ok('rows are not draggable until the handle is pressed', tr3.draggable!==true);
tr3.querySelector('.feeGripCell').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));
ok('pressing the handle arms the row', tr3.draggable===true);

/* drive a real drag: row 3 dropped below row 6 */
function fire(el,type,extra){
  const e=new dom.window.Event(type,{bubbles:true,cancelable:true});
  Object.assign(e,{dataTransfer:{setData(){},getData(){return ''},effectAllowed:'',dropEffect:''}},extra||{});
  el.dispatchEvent(e); return e;
}
/* pick a source and a target that are genuinely different units: dropping
   a unit inside itself is correctly a no-op, so it proves nothing */
const L0=STATE.fees.setup;
const srcIdx=L0.findIndex(r=>r.t==='item');
const srcUnit=feeUnitAt(L0,srcIdx);
const tgtIdx=L0.findIndex((r,i)=>i>=srcUnit.end&&r.t==='item');
const before=labels().slice();
const moving=before[srcIdx];
const target=rows()[tgtIdx];
fire(rows()[srcIdx],'dragstart');
ok('the drag records its source', FEE_DRAG&&FEE_DRAG.idx===srcIdx, JSON.stringify(FEE_DRAG));
target.getBoundingClientRect=()=>({top:0,height:20});
fire(target,'dragover',{clientY:18});     // lower half -> drop below
ok('the drop target is marked', target.classList.contains('feedropbelow'));
fire(target,'drop',{clientY:18});
const after=labels();
ok('the row moved', after.indexOf(moving)>before.indexOf(moving),
   `"${String(moving).slice(0,22)}" ${before.indexOf(moving)} -> ${after.indexOf(moving)}`);
ok('nothing was lost', after.length===before.length, before.length+' -> '+after.length);
ok('the same set of lines is present',
   JSON.stringify(after.slice().sort())===JSON.stringify(before.slice().sort()));

/* a description row drags its priced parent, not itself alone */
STATE.fees.setup=composeFees(['ac','cis'],'setup'); renderFeeEditor();
const dIdx=STATE.fees.setup.findIndex(r=>r.t==='desc');
const dUnit=feeUnitAt(STATE.fees.setup,dIdx);
ok('a description row belongs to the priced row below it',
   STATE.fees.setup[dUnit.end-1].t==='item',
   `rows ${dUnit.start}..${dUnit.end-1} move together`);
const far=STATE.fees.setup.findIndex((r,i)=>i>=dUnit.end&&r.t==='grp');
const descLabels=STATE.fees.setup.slice(dUnit.start,dUnit.end).map(r=>r.l);
fire(rows()[dIdx],'dragstart');
const t2=rows()[far]; t2.getBoundingClientRect=()=>({top:0,height:20});
fire(t2,'dragover',{clientY:18}); fire(t2,'drop',{clientY:18});
const nowAt=STATE.fees.setup.findIndex(r=>r.l===descLabels[0]);
ok('dragging a description carries its whole priced block',
   STATE.fees.setup.slice(nowAt,nowAt+descLabels.length).map(r=>r.l).join('|')===descLabels.join('|'),
   descLabels.length+' rows stayed together');

/* dropping a row on itself does nothing */
const snap=labels().join('|');
fire(rows()[2],'dragstart');
const self=rows()[2]; self.getBoundingClientRect=()=>({top:0,height:20});
fire(self,'dragover',{clientY:2}); fire(self,'drop',{clientY:2});
ok('dropping a row on itself is a no-op', labels().join('|')===snap);

/* a heading drags its whole group */
STATE.fees.setup=composeFees(['ac','cis'],'setup'); renderFeeEditor();
const grpIdx=STATE.fees.setup.findIndex((r,i)=>r.t==='grp'&&i>0);
const g0=STATE.fees.setup.filter(r=>r.t==='grp').map(r=>r.l);
const nRows=STATE.fees.setup.length;
fire(rows()[grpIdx],'dragstart');
const top=rows()[0]; top.getBoundingClientRect=()=>({top:0,height:20});
fire(top,'dragover',{clientY:2}); fire(top,'drop',{clientY:2});
const g1=STATE.fees.setup.filter(r=>r.t==='grp').map(r=>r.l);
ok('dragging a heading moves the whole group',
   g1[0]===g0[1]&&STATE.fees.setup.length===nRows, g0.join(' , ')+'  ->  '+g1.join(' , '));
ok('the moved group kept its lines',
   feeBlocks(STATE.fees.setup).find(b=>b.grp===g0[1]).items.length===
   feeBlocks(composeFees(['ac','cis'],'setup')).find(b=>b.grp===g0[1]).items.length);

console.log(fails?`\n${fails} FAILURES`:'\ndrag-and-drop moves the right rows and loses nothing');
process.exit(fails?1:0);
