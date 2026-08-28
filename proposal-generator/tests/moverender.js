/* the editor markup: does every row get arrows, and do the columns line up? */
const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
eval(grab(/function feeEditorRow\(r,path,del,mv\)\{[\s\S]*?\n\}/));
let fails=0;
const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
const cells=h=>(h.match(/<td/g)||[]).length +
  (h.match(/colspan="(\d)"/g)||[]).reduce((a,m)=>a+(+m.match(/\d/)[0]-1),0);

const item=feeEditorRow({t:'item',l:'Onboarding',v:1500},'P','del()',true);
const desc=feeEditorRow({t:'desc',l:'Compliance Review'},'P','del()',true);
const grp =feeEditorRow({t:'grp', l:'AUTHORISED COMPANY (AC)'},'P','del()',true);
ok('priced row spans 4 columns', cells(item)===4, cells(item)+' columns');
ok('description row spans 4 columns', cells(desc)===4, cells(desc)+' columns');
ok('group heading row spans 4 columns', cells(grp)===4, cells(grp)+' columns');
ok('every row type has a grab handle',
   [item,desc,grp].every(h=>h.includes('feeGripCell')&&h.includes('feeGrip')));
ok('a heading says it drags the whole group', grp.includes('Drag to move this group'));
ok('a line says it drags the line', item.includes('Drag to move this line'));
ok('no leftover arrow buttons', ![item,desc,grp].some(h=>h.includes('feeMove')));
const noMove=feeEditorRow({t:'item',l:'x',v:1},'P','del()',false);
ok('rows without a move handler still balance', cells(noMove)===4);
console.log(fails?`\n${fails} FAILURES`:'\nthe editor markup is well formed');
process.exit(fails?1:0);
