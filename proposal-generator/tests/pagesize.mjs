import { pdfPageSize } from '/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/mcp-server/lib/proposal.js';
import fs from 'fs';
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

/* The generator itself, rather than a scratch copy of an export: the @page
   rule is the same one, and this way the test cannot pass against a stale
   fixture — or fail merely because the scratch file was cleared. */
const real=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const s=pdfPageSize(real);
ok('reads the deck\'s own page box', s.width==='300mm'&&s.height==='190mm'&&s.fromCss,
   `${s.width} x ${s.height}`);
ok('  ...which is NOT Letter (216 x 279mm)', !(s.width==='216mm'));

/* the shape that produced the broken file */
ok('a deck with no @page falls back to the deck size, not Letter',
   (()=>{const f=pdfPageSize('<html><style>body{}</style></html>');
         return f.width==='300mm'&&f.height==='190mm'&&f.fromCss===false;})());

/* other units and spacings */
[['@page{size:210mm 297mm}','210mm','297mm'],
 ['@page { size : 8.5in 11in ; margin:0 }','8.5in','11in'],
 ['@page{margin:0;size:842pt 527pt;}','842pt','527pt'],
].forEach(([css,w,h])=>{
  const r=pdfPageSize('<style>'+css+'</style>');
  ok('  parses '+css.slice(0,34), r.width===w&&r.height===h, r.width+' x '+r.height);
});

console.log(fails?`\n${fails} FAILURES`:'\nthe page box is taken from the deck, not guessed');
process.exit(fails?1:0);
