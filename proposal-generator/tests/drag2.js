/* Drives the pointer-based drag exactly as a mouse would: press the handle,
   move over a target, release. */
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
const dom=new JSDOM('<div id="pane" style="overflow-y:auto"><table><tbody id="feeSetup"></tbody></table></div><table><tbody id="feeFixed"></tbody></table>');
global.window=dom.window; global.document=dom.window.document;
global.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);

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
 grab(/function feeScrollParent\(el\)\{[\s\S]*?\n\}/),
 grab(/function feeDragMove\(e\)\{[\s\S]*?\n\}/),
 grab(/function feeDragDrop\(\)\{[\s\S]*?\n\}/),
 grab(/function rowsTotal\(rows\)\{[\s\S]*?\n\}/),
 grab(/function renderFeeEditor\(\)\{[\s\S]*?\n\}/),
].join('\n').replace(/^const /gm,'var ').replace(/^let FEE_DRAG/m,'var FEE_DRAG'));

global.$=id=>document.getElementById(id);
global.liveBuild=()=>{}; global.feeTotals=()=>{}; global.curSym=()=>'US$'; global.money=v=>String(v);
global.STATE={fees:{setup:composeFees(['ac','cis'],'setup'),fixed:[]},feeCols:[]};

let fails=0;
const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
const labels=()=>STATE.fees.setup.map(r=>r.l);
const tb=()=>$('feeSetup');
const rows=()=>[...tb().querySelectorAll('tr.feerow')];

renderFeeEditor();

/* lay the rows out at 20px each so geometry is predictable */
function geo(){rows().forEach((tr,i)=>{tr.getBoundingClientRect=()=>({top:i*20,bottom:i*20+20,height:20,left:0,right:200});});}
geo();
document.elementFromPoint=(x,y)=>{const i=Math.floor(y/20);return rows()[i]||null;};

function drag(fromIdx,toIdx,lower){
  const tr=rows()[fromIdx];
  tr.querySelector('.feeGripCell').dispatchEvent(
    new dom.window.MouseEvent('mousedown',{bubbles:true,button:0}));
  const y=toIdx*20+(lower?15:5);
  document.dispatchEvent(new dom.window.MouseEvent('mousemove',{bubbles:true,clientX:5,clientY:y}));
  document.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));
  geo();
}

/* wiring is once-only, however many times we render */
const before=labels().slice();
renderFeeEditor();renderFeeEditor();geo();
ok('handlers are wired once, not once per render', tb()._feeDragWired===true);

const L=STATE.fees.setup;
const src=L.findIndex(r=>r.t==='item');
const u=feeUnitAt(L,src);
const tgt=L.findIndex((r,i)=>i>=u.end&&r.t==='item');
const moving=labels()[src];
drag(src,tgt,true);
ok('pressing the handle and releasing over a later row moves it',
   labels().indexOf(moving)>before.indexOf(moving),
   `"${String(moving).slice(0,20)}" ${before.indexOf(moving)} -> ${labels().indexOf(moving)}`);
ok('nothing lost', labels().length===before.length);
ok('same lines present',
   JSON.stringify(labels().slice().sort())===JSON.stringify(before.slice().sort()));
ok('drag state is cleared afterwards', FEE_DRAG===null);
ok('no drop marker left behind',
   !tb().querySelector('.feedropabove,.feedropbelow,.feedragging'));

/* releasing outside the list changes nothing */
const snap=labels().join('|');
const tr0=rows()[1];
tr0.querySelector('.feeGripCell').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,button:0}));
document.elementFromPoint=()=>null;
document.dispatchEvent(new dom.window.MouseEvent('mousemove',{bubbles:true,clientX:5,clientY:9999}));
document.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));
ok('releasing outside the list leaves the order alone', labels().join('|')===snap);
document.elementFromPoint=(x,y)=>{const i=Math.floor(y/20);return rows()[i]||null;};geo();

/* a click on the handle without moving must not reorder */
const snap2=labels().join('|');
rows()[2].querySelector('.feeGripCell').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,button:0}));
document.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));
ok('a click with no movement does nothing', labels().join('|')===snap2);

/* right-click must not start a drag */
rows()[2].querySelector('.feeGripCell').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,button:2}));
ok('right-click does not start a drag', FEE_DRAG===null);
document.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));

/* mousedown anywhere but the handle must not start a drag */
rows()[2].querySelector('input').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,button:0}));
ok('pressing inside a text field does not start a drag', FEE_DRAG===null);

console.log(fails?`\n${fails} FAILURES`:'\npointer drag works end to end');
process.exit(fails?1:0);
