/* end-to-end: does pgFee actually emit the right number of <div class="page">
   with the TOTAL on the last one only, and the continuation marked? */
const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
const SRC=[
 grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),
 grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeBlocks\(rows\)\{[\s\S]*?\n\}/),
 grab(/function feeBlockHTML\(b\)\{[\s\S]*?\n\}/),
 grab(/const FEE_H=[^\n]*/),
 grab(/function feeBlockHeight\(b\)\{[\s\S]*?\n\}/),
 grab(/function feeItemHeight\(it\)\{[^\n]*\}/),
 grab(/const FEE_COL_CAP=[^\n]*/),
 grab(/function twoColumnsFit\(blocks,heights,stack\)\{[\s\S]*?\n\}/),
 grab(/function splitTallFeeBlocks\(blocks,capacity\)\{[\s\S]*?\n\}/),
 grab(/function balanceFeeColumns\(parts,capacity,n\)\{[\s\S]*?\n\}/),
 grab(/function packFeeColumns\(blocks,capacity\)\{[\s\S]*?\n\}/),
  grab(/function companyCount\(ent\)\{[\s\S]*?\n\}/),
 grab(/function rowsTotal\(rows\)\{[\s\S]*?\n\}/),
 grab(/function feeTotal\(which\)\{[\s\S]*?\n\}/),
 grab(/function usesFeeCols\(\)\{[\s\S]*?\n\}/),
 grab(/function feePage\(title,sub,inner\)\{[\s\S]*?\n\}/),
 grab(/function pgFee\(which,d\)\{[\s\S]*?\n\}/),
].join('\n').replace(/^const /gm,'var ');
eval(SRC);
global.money=v=>String(v);
global.page=(inner,cls)=>'<div class="page '+(cls||'')+'">'+inner+'</div>';
global.crest=()=>''; global.foot=()=>'<footer>';
global.STATE={mode:'structure',entities:{company:'ac',companyCount:1},feeCols:[],fees:{setup:[],fixed:[]}};

let fails=0;
function run(label,keys,which,expectPages){
  STATE.fees[which]=composeFees(keys,which);
  const out=pgFee(which,{currency:'USD'});
  const pages=(out.match(/<div class="page /g)||[]).length;
  const totals=(out.match(/>TOTAL</g)||[]).length;
  const cont=(out.match(/— continued/g)||[]).length;
  const ok = pages===expectPages && totals===1 && cont===pages-1;
  if(!ok)fails++;
  console.log((ok?'PASS  ':'FAIL  ')+label.padEnd(32)+
    `pages ${pages} (want ${expectPages})  TOTAL rows ${totals}  "continued" ${cont}`);
  return out;
}
run('AC only — one page',            ['ac'],'setup',1);
run('AC + CIS — one page',           ['ac','cis'],'setup',1);
run('AC+CIS+MFO+GBC — two pages',    ['ac','cis','mfo','gbc'],'setup',2);
run('everything — two pages',        ['trust','gbc','ac','cis','mfo'],'setup',2);

const out=run('(inspect)',['ac','cis','mfo','gbc'],'setup',2);
console.log('\nsubtitles emitted:');
(out.match(/<em[^>]*>([^<]*)<\/em>/g)||[]).forEach(m=>console.log('   ',m.replace(/<[^>]*>/g,'')));
console.log(fails?`\n${fails} FAILURES`:'\npagination emits the pages, totals and continuation markers correctly');
process.exit(fails?1:0);
