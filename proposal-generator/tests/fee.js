const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
eval([
 grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),
 grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeBlocks\(rows\)\{[\s\S]*?\n\}/),
 grab(/const FEE_H=[^\n]*/),
 grab(/function feeBlockHeight\(b\)\{[\s\S]*?\n\}/),
 grab(/function feeItemHeight\(it\)\{[^\n]*\}/),
 grab(/const FEE_COL_CAP=[^\n]*/),
 grab(/function twoColumnsFit\(blocks,heights,stack\)\{[\s\S]*?\n\}/),
 grab(/function splitTallFeeBlocks\(blocks,capacity\)\{[\s\S]*?\n\}/),
 grab(/function balanceFeeColumns\(parts,capacity,n\)\{[\s\S]*?\n\}/),
 grab(/function packFeeColumns\(blocks,capacity\)\{[\s\S]*?\n\}/),
].join('\n').replace(/^const /gm,'var ').replace(/\bconst FEE_COL_CAP/,'var FEE_COL_CAP'));

let fails=0;
function scenario(label, keys, which){
  const rows=composeFees(keys,which);
  const blocks=feeBlocks(rows);
  const stack=blocks.reduce((a,b)=>a+feeBlockHeight(b),0);
  const cols=packFeeColumns(blocks,FEE_COL_CAP);
  const pages=Math.ceil(cols.length/2);
  const over=cols.map((c,i)=>({i,h:+c.reduce((a,b)=>a+feeBlockHeight(b),0).toFixed(1)}))
                 .filter(c=>c.h>FEE_COL_CAP+0.01);
  const itemsIn=cols.reduce((a,c)=>a+c.reduce((x,b)=>x+b.items.length,0),0);
  const itemsOut=blocks.reduce((a,b)=>a+b.items.length,0);
  const ok = over.length===0 && itemsIn===itemsOut;
  if(!ok)fails++;
  console.log((ok?'PASS  ':'FAIL  ')+label.padEnd(34)+
    `stack ${stack.toFixed(0).padStart(4)}mm  cols ${cols.length}  pages ${pages}  rows ${itemsIn}/${itemsOut}`+
    (over.length?`  OVERFLOWING: ${JSON.stringify(over)}`:''));
  return cols;
}
console.log(`column capacity ${FEE_COL_CAP.toFixed(1)}mm (avail ${FEE_H.avail} less header ${FEE_H.header})\n`);
scenario('AC only',                    ['ac'],'setup');
scenario('AC + CIS',                   ['ac','cis'],'setup');
scenario('the screenshot: AC+CIS+MFO+GBC', ['ac','cis','mfo','gbc'],'setup');
scenario('same, fixed fees',           ['ac','cis','mfo','gbc'],'fixed');
scenario('everything',                 ['trust','gbc','ac','cis','mfo','nominee','accounting'],'setup');
scenario('everything, fixed',          ['trust','gbc','ac','cis','mfo','nominee','accounting'],'fixed');

console.log('\n--- how the screenshot case lays out ---');
const cols=scenario('(detail)', ['ac','cis','mfo','gbc'],'setup');
cols.forEach((c,i)=>{
  const h=c.reduce((a,b)=>a+feeBlockHeight(b),0);
  console.log(`  page ${Math.floor(i/2)+1} col ${i%2+1}  ${h.toFixed(0).padStart(3)}mm  ` +
    c.map(b=>(b.grp||'(no heading)')+'×'+b.items.length).join(' | '));
});

console.log("\n--- pathological: one group far taller than a column ---");
const big={grp:'DISBURSEMENT TO AUTHORITIES: REGULATORY FEES',
  items:Array.from({length:40},(_,i)=>({lines:[{l:'Regulatory line '+(i+1)}],v:100}))};
const parts=splitTallFeeBlocks([big],FEE_COL_CAP);
console.log('  split into',parts.length,'pieces:',parts.map(p=>p.grp.slice(-12)+'x'+p.items.length).join(' | '));
const rows=parts.reduce((a,p)=>a+p.items.length,0);
console.log('  rows preserved:',rows,'of 40', rows===40?'OK':'*** LOST ROWS ***');
const tall=packFeeColumns([big],FEE_COL_CAP);
const worst=Math.max(...tall.map(c=>c.reduce((a,b)=>a+feeBlockHeight(b),0)));
console.log('  columns:',tall.length,' tallest',worst.toFixed(0)+'mm', worst<=FEE_COL_CAP?'OK':'*** OVERFLOW ***');
console.log('  headings:',tall.flat().map(b=>b.grp.endsWith('(CONT.)')?'(CONT.)':'first').join(', '));

console.log("\n--- two-column guard ---");
function tc(hs){const bs=hs.map(h=>({grp:'G',items:[{lines:[{l:'x'}],v:1}]}));
  return twoColumnsFit(bs,hs,hs.reduce((a,b)=>a+b,0));}
console.log('  balanced 90+90        ->', tc([90,90])?'two columns':'paginate');
console.log('  one 130mm group +60   ->', tc([130,60])?'two columns':'paginate  (correct: 130 > cap)');

console.log(fails?`\n${fails} FAILURES`:'\nno column exceeds capacity; every row accounted for');
process.exit(fails?1:0);
