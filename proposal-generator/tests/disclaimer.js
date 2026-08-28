/* the disclaimer is on by default, in the right place, and still optional */
const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
eval([grab(/const ENTITY_META = \{[\s\S]*?\n\};/),
 grab(/function companyCount\(ent\)\{[\s\S]*?\n\}/),
 grab(/const PAGE_KINDS=[^\n]*/),
 grab(/function structureKinds\(ent\)\{[\s\S]*?\n\}/),
 grab(/function defaultServices\(ent\)\{[\s\S]*?\n\}/),
 grab(/function structureSections\(ent\)\{[\s\S]*?\n\}/)].join('\n').replace(/^const /gm,'var '));
global.STATE={extraKinds:[]};
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

const E=o=>Object.assign({company:'none',companyCount:1,trust:false,cis:false},o);
[['AC',E({company:'ac'})],
 ['GBC',E({company:'gbc'})],
 ['Trust + AC + CIS',E({company:'ac',trust:true,cis:true})]].forEach(([n,e])=>{
  const s=structureSections(e);
  ok(n+': disclaimer is present', s.includes('disclaimer'));
  ok('  ...and comes first, before the contents',
     s[0]==='disclaimer'&&s[1]==='contents', s.slice(0,3).join(' -> '));
});

/* the other proposal types too */
['fundlux','mfo','accounting'].forEach(()=>{});
const specs=[...html.matchAll(/sections:\[([^\]]*)\]/g)].map(m=>m[1].split(',')[0].replace(/'/g,''));
ok('every static product spec leads with the disclaimer',
   specs.length>0&&specs.every(s=>s==='disclaimer'), specs.join(', '));

/* still a toggle, not hardcoded */
ok('it remains switchable in step 1', /disclaimer:\['Disclaimer'/.test(html));
ok('build() honours the toggle',
   /on\('disclaimer'\)/.test(html));

/* page numbering: cover is 1 and unnumbered, so the disclaimer is 2 */
ok('the cover reserves page 1', /PAGENO=1;.*cover is page 1, unnumbered/.test(html));
ok('the disclaimer page draws a footer, so it is numbered',
   /function pgDisclaimer\(\)\{[\s\S]*?foot\(\)/.test(html));

console.log(fails?`\n${fails} FAILURES`:'\ndisclaimer defaults on, page 2, still optional');
process.exit(fails?1:0);
