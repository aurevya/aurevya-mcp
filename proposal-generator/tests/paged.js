/* the rules that guarantee one deck page per printed sheet */
const fs=require('fs');
const ROOT='/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator';
const html=fs.readFileSync(ROOT+'/proposal-generator.html','utf8');
const css=html.slice(html.indexOf('<style>')+7, html.indexOf('</style>'));
const nc=css.replace(/\/\*[\s\S]*?\*\//g,'');
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

const print=nc.match(/@media print\{([\s\S]*?)\n\}/)[1];
const pageRule=(print.match(/\.page\s*\{([^}]*)\}/)||[])[1]||'';

ok('the print block keeps each page whole',
   /break-inside:\s*avoid/.test(pageRule)&&/page-break-inside:\s*avoid/.test(pageRule),
   'break-inside present');
ok('  ...and forces a sheet after each one',
   /break-after:\s*page/.test(pageRule)&&/page-break-after:\s*always/.test(pageRule));
ok('  ...without a trailing blank sheet',
   /\.page:last-child\{[^}]*break-after:\s*auto/.test(print));
ok('  ...with no margin between pages', /margin:\s*0/.test(pageRule));
ok('  ...and body margin zeroed', /html,body\{[^}]*margin:\s*0/.test(print));

/* the page box and the page element must agree, or the near-miss splits */
const pw=(nc.match(/--pw:\s*([\d.]+mm)/)||[])[1];
const ph=(nc.match(/--ph:\s*([\d.]+mm)/)||[])[1];
const at=nc.match(/@page\{size:\s*([\d.]+mm)\s+([\d.]+mm)/);
ok('the @page box matches the .page element',
   at&&at[1]===pw&&at[2]===ph, `@page ${at&&at[1]} x ${at&&at[2]}  vs  .page ${pw} x ${ph}`);
ok('and both match the approved deck (300 x 190mm)',
   pw==='300mm'&&ph==='190mm', `${pw} x ${ph}`);

/* the structure panel must not still be measured against the old page */
const sf=nc.match(/const STRUCT_FIT=\{w:(\d+),h:(\d+)\}/)
      || html.match(/const STRUCT_FIT=\{w:(\d+),h:(\d+)\}/);
ok('the structure diagram is measured against the new page',
   sf && +sf[1]>176 && +sf[2]>150, sf?`w:${sf[1]} h:${sf[2]}`:'not found');

console.log(fails?`\n${fails} FAILURES`:'\npagination rules are in place');
process.exit(fails?1:0);
