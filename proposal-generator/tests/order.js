const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];};
eval([
 grab(/const ENTITY_META = \{[\s\S]*?\n\};/),
 grab(/function companyCount\(ent\)\{[\s\S]*?\n\}/),
 grab(/const PAGE_KINDS=[^\n]*/),
 grab(/function structureKinds\(ent\)\{[\s\S]*?\n\}/),
 grab(/function defaultServices\(ent\)\{[\s\S]*?\n\}/),
 grab(/function structureSections\(ent\)\{[\s\S]*?\n\}/),
].join('\n'));
global.STATE={extraKinds:[]};

const LABEL={trustfacts:'Trust',gbcdivider:'Global Business Company',
             ackeydivider:'Authorised Company',cisdivider:'CIS (PCC)'};
function flow(ent, extra){
  STATE.extraKinds=extra||[];
  return structureSections(ent).filter(s=>LABEL[s]).map(s=>LABEL[s]);
}
let fails=0;
const want=['Trust','Global Business Company','Authorised Company','CIS (PCC)'];
function check(label, got){
  // the order must always be a subsequence of the house order
  let i=0, ok=true;
  for(const g of got){ const j=want.indexOf(g,i); if(j<0){ok=false;break;} i=j+1; }
  console.log((ok?'PASS  ':'FAIL  ')+label.padEnd(38)+got.join(' -> '));
  if(!ok)fails++;
}
const E=(o)=>Object.assign({company:'none',companyCount:1,trust:false,cis:false},o);
check('AC only',              flow(E({company:'ac'})));
check('GBC only',             flow(E({company:'gbc'})));
check('Trust + AC',           flow(E({company:'ac',trust:true})));
check('Trust + GBC',          flow(E({company:'gbc',trust:true})));
check('Trust + GBC + CIS',    flow(E({company:'gbc',trust:true,cis:true})));
check('AC + CIS',             flow(E({company:'ac',cis:true})));
check('Trust + AC + CIS',     flow(E({company:'ac',trust:true,cis:true})));
console.log('\n-- with a second company added on the canvas --');
check('AC selected, GBC on canvas',  flow(E({company:'ac'}),  ['gbc']));
check('GBC selected, AC on canvas',  flow(E({company:'gbc'}), ['ac']));
check('AC + canvas GBC + Trust',     flow(E({company:'ac',trust:true}), ['gbc']));
check('everything at once',          flow(E({company:'ac',trust:true,cis:true}), ['gbc']));
console.log(fails?`\n${fails} FAILURES`:'\nevery combination follows Trust -> GBC -> AC -> CIS');
process.exit(fails?1:0);
