const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
eval([grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeBlocks\(rows\)\{[\s\S]*?\n\}/),
 grab(/function feeUnitAt\(list,idx\)\{[\s\S]*?\n\}/),
 grab(/function feeListFor\(which,ci\)\{[\s\S]*?\n\}/),
 grab(/function moveFeeUnit\(which,ci,fromIdx,overIdx,after\)\{[\s\S]*?\n\}/)]
 .join('\n').replace(/^const /gm,'var '));
global.renderFeeEditor=()=>{};global.liveBuild=()=>{};
global.STATE={fees:{setup:[],fixed:[]},feeCols:[]};
let fails=0;
const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
const reset=()=>{STATE.fees.setup=composeFees(['ac'],'setup');};
const L=()=>STATE.fees.setup;
const lab=()=>L().map(r=>r.l);
const allText=()=>lab().slice().sort().join('|');

/* the exact thing that was broken: reorder two description lines */
reset();
const t0=allText();
ok('a description can be moved above another',
   (()=>{moveFeeUnit('setup',null,3,2,false);return lab()[2]==='Company Formation'&&lab()[3]==='Compliance Review';})(),
   lab().slice(2,4).join(' , '));
ok('  ...and nothing else changed', allText()===t0);

/* move a description into a different priced block */
reset();
moveFeeUnit('setup',null,2,1,false);          // put it above "Onboarding"
let b=feeBlocks(L());
ok('a description can be moved onto another figure',
   b[0].items[0].lines.map(l=>l.l).join('|')==='Compliance Review|Onboarding',
   b[0].items[0].lines.map(l=>l.l).join(' + '));
ok('  ...and the figure it left is intact',
   b[0].items[1].lines[b[0].items[1].lines.length-1].l==='Bank account opening');

/* the priced row still carries its wording */
reset();
const beforeLines=feeBlocks(L())[0].items[1].lines.length;
moveFeeUnit('setup',null,8,10,true);          // drag "Bank account opening" into ACCOUNTING
b=feeBlocks(L());
const moved=b.find(x=>x.grp==='ACCOUNTING').items.find(i=>i.lines.some(l=>l.l==='Bank account opening'));
ok('a priced row still takes its description lines with it',
   moved&&moved.lines.length===beforeLines, moved?moved.lines.length+' lines':'not found');

/* nothing is ever lost, including orphaned descriptions */
reset();
const n0=L().length,text0=allText();
moveFeeUnit('setup',null,2,L().length-1,true); // park a description after the last price
ok('a description dropped below the last price is not lost',
   L().length===n0&&allText()===text0);
const printed=feeBlocks(L()).flatMap(x=>x.items).flatMap(i=>i.lines).map(l=>l.l);
ok('  ...and it still prints', printed.includes('Compliance Review'),
   'orphan renders with an empty price cell');
ok('  ...every line in the list reaches the page',
   L().filter(r=>r.t!=='grp').every(r=>printed.includes(r.l)),
   printed.length+' lines printed');

/* 500 random drags never lose a row or change a figure */
reset();
const sum=()=>L().filter(r=>r.t==='item').reduce((a,r)=>a+(+r.v||0),0);
const s0=sum(),c0=L().length,txt=allText();
for(let k=0;k<500;k++){
  const a=Math.floor(Math.random()*L().length),z=Math.floor(Math.random()*L().length);
  moveFeeUnit('setup',null,a,z,Math.random()<0.5);
}
ok('500 random drags lose no rows', L().length===c0, c0+' -> '+L().length);
ok('  ...change no figures', sum()===s0, s0+' -> '+sum());
ok('  ...and keep every line', allText()===txt);
const printed2=feeBlocks(L()).flatMap(x=>x.items).flatMap(i=>i.lines).map(l=>l.l);
ok('  ...with all of them still printing',
   L().filter(r=>r.t!=='grp').every(r=>printed2.includes(r.l)));

console.log(fails?`\n${fails} FAILURES`:'\nrows move where they are put, and nothing is lost');
process.exit(fails?1:0);
