/* Checks the markup renderFeeEditor produces, which is what the pointer
   drag then relies on: every row tagged with the list it belongs to and its
   position in it, and a handle to grab it by.

   The drag itself is exercised in drag2.js. This file used to drive the
   HTML5 dragstart/dragover/drop events; that implementation was replaced by
   a pointer-based one — you press the handle and move the row under the
   cursor — so those assertions were testing behaviour that is deliberately
   gone. What remains here is the part that is still true and still worth
   guarding: if a row loses its data-idx or its grip, the drag has nothing
   to work from and fails in a way that is hard to read from drag2.js. */
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

renderFeeEditor();
const tb=$('feeSetup');
const rows=()=>[...tb.querySelectorAll('tr.feerow')];

ok('every fee line gets a row', rows().length===STATE.fees.setup.length,
   rows().length+' of '+STATE.fees.setup.length);
ok('each row carries its list and index',
   rows().every((tr,i)=>tr.dataset.idx===String(i)&&tr.dataset.ci===''&&tr.dataset.which==='setup'));
ok('each row has a grab handle', rows().every(tr=>tr.querySelector('.feeGripCell')));

/* the indices the rows advertise have to agree with the array the drag
   moves things in, or a drag lands somewhere other than where it looks */
const mismatched=rows().filter(tr=>{
  const r=feeListFor(tr.dataset.which,tr.dataset.ci)[Number(tr.dataset.idx)];
  if(!r)return true;
  /* an item's label is an editable field, so it is the input's value; a
     group heading is plain text in its own cell */
  const shown=[...tr.querySelectorAll('input')].map(i=>i.value);
  const heading=tr.querySelector('td.grp');
  if(heading)shown.push(heading.textContent.trim());
  return r.l!==undefined && !shown.includes(String(r.l));
});
ok('a row\'s index resolves to the line it displays', mismatched.length===0,
   mismatched.length?mismatched[0].dataset.idx+': '+mismatched[0].innerHTML.slice(0,80):undefined);

/* nothing is armed until the handle is used */
ok('no drag is in progress after a plain render', FEE_DRAG===null);
ok('no drop marker is left over from a previous render',
   !tb.querySelector('.feedropabove,.feedropbelow,.feedragging'));

console.log(fails?`\n${fails} FAILURES`:'\nthe fee rows are drag-ready');
process.exit(fails?1:0);
