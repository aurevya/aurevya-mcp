const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
eval([
 grab(/const ENTITY_META = \{[\s\S]*?\n\};/),
 grab(/const ENTITY_TITLE_ORDER=[^\n]*/),
 grab(/const COUNT_WORD=[^\n]*/),
 grab(/function companyCount\(ent\)\{[\s\S]*?\n\}/),
 grab(/function entityCounts\(ent\)\{[\s\S]*?\n\}/),
 grab(/function entityOrder\(ent\)\{[\s\S]*?\n\}/),
 grab(/function joinPhrase\(list,upper\)\{[\s\S]*?\n\}/),
 grab(/function structureLabel\(list\)\{[\s\S]*?\n\}/),
].join('\n'));

global.STATE={mode:'structure',struct:null};
const E=o=>Object.assign({company:'none',companyCount:1,trust:false,cis:false},o);
const box=(entKey)=>({kind:'box',entKey});
const seeded=(id)=>({kind:'box',id});   // no entKey — the sidebar owns these

let fails=0;
function show(label, ent, canvasBoxes, expectCover){
  STATE.struct = canvasBoxes ? {nodes:canvasBoxes} : null;
  const list=entityOrder(ent);
  const cover='Proposal for setting up'+(list.filter(k=>k==='ac'||k==='gbc').length>1?' of':'')+
              '\n  '+joinPhrase(list,false);
  const foot='PROPOSAL FOR SETTING UP '+joinPhrase(list,true);
  const ok = expectCover===undefined || joinPhrase(list,false)===expectCover;
  if(!ok)fails++;
  console.log((ok?'  ':'FAIL ')+label);
  console.log('    cover : '+joinPhrase(list,false));
  console.log('    footer: '+foot);
  console.log('    file  : '+structureLabel(list));
  if(!ok)console.log('    EXPECTED: '+expectCover);
  console.log();
}

console.log('=== sidebar only (unchanged behaviour) ===');
show('AC',            E({company:'ac'}), null, 'an Authorised Company');
show('2 x AC',        E({company:'ac',companyCount:2}), null, '2 Authorised Companies');
show('Trust + GBC',   E({company:'gbc',trust:true}), null, 'a Trust and a Global Business Company');

console.log('=== entity ADDED on the canvas ===');
show('AC, then a Foundation added',
     E({company:'ac'}), [seeded('ac'), box('foundation')],
     'an Authorised Company and a Foundation');
show('AC, then a GBC added',
     E({company:'ac'}), [seeded('ac'), box('gbc')],
     'a Global Business Company and an Authorised Company');
show('Trust + AC, then 2 Foundations added',
     E({company:'ac',trust:true}), [seeded('trust'),seeded('ac'),box('foundation'),box('foundation')],
     'a Trust, an Authorised Company and 2 Foundations');
show('AC, then a blank box added (must be ignored)',
     E({company:'ac'}), [seeded('ac'), box('other')],
     'an Authorised Company');

console.log('=== entity DELETED ===');
show('2 x AC reduced to 1 (sidebar count updated by renumber)',
     E({company:'ac',companyCount:1}), [seeded('ac')],
     'an Authorised Company');
show('Foundation removed again',
     E({company:'ac'}), [seeded('ac')],
     'an Authorised Company');

console.log('=== the full set ===');
show('Trust + 2 GBC + AC + CIS + LP',
     E({company:'gbc',companyCount:2,trust:true,cis:true}),
     [seeded('trust'),seeded('gbc1'),seeded('gbc2'),seeded('cis'),box('ac'),box('partnership')]);

console.log(fails?fails+' FAILURES':'all title/footer expectations met');
process.exit(fails?1:0);
