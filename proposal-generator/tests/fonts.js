/* the fonts are declared, present, valid, and will actually deploy */
const fs=require('fs'),path=require('path');
const ROOT='/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation';
const html=fs.readFileSync(ROOT+'/proposal-generator/proposal-generator.html','utf8');
const dir=ROOT+'/proposal-generator/assets/fonts';
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

/* every @font-face src must point at a file that exists */
const srcs=[...html.matchAll(/@font-face\{[^}]*?font-weight:(\d+);[^}]*?url\('([^']+)'\)/gs)]
  .map(m=>({weight:+m[1],url:m[2]}));
ok('nine faces declared (4 Riviera + 5 Cormorant)', srcs.length===9,
   srcs.length+' declared');
srcs.forEach(s=>{
  const p=path.join(ROOT,'proposal-generator',s.url);
  ok('  '+s.weight+' -> '+path.basename(s.url)+' exists', fs.existsSync(p),
     fs.existsSync(p)?Math.round(fs.statSync(p).size/1024)+'K':'MISSING');
});

/* the files really are woff2 (magic number 'wOF2') */
fs.readdirSync(dir).filter(f=>f.endsWith('.woff2')).forEach(f=>{
  const b=fs.readFileSync(path.join(dir,f)).subarray(0,4).toString('latin1');
  ok('  '+f+' is a valid woff2', b==='wOF2', JSON.stringify(b));
});

/* the deck asks for the family, and falls back gracefully */
ok('--sans leads with Riviera Nights', /--sans:'Riviera Nights'/.test(html));
ok('a fallback stack remains', /--sans:'Riviera Nights',\s*'Jost'/.test(html));
/* count inside the @font-face blocks only — the prose above them mentions
   font-display too, and matching the whole file counted that as well */
const faces=html.match(/@font-face\{[^}]*\}/gs)||[];
ok('nine @font-face blocks', faces.length===9, faces.length+' found');
ok('font-display:block on every face',
   faces.every(f=>/font-display:block/.test(f)));
ok('both families are declared',
   faces.some(f=>/'Riviera Nights'/.test(f))&&faces.some(f=>/'Cormorant Garamond'/.test(f)));

/* the fault that produced the broken PDF: the deck fetched its serif from
   Google, which the render container could not reach, so every heading
   fell back to Times */
ok('the deck no longer depends on Google Fonts',
   !/href="https:\/\/fonts\.googleapis\.com/.test(html));
ok('nor does the exported deck', (()=>{
   const m=html.match(/function buildExportHTML\(\)\{[\s\S]*?\n\}/)[0];
   return !/fonts\.googleapis\.com/.test(m);})());

/* the trap that bit logo-white.svg: will the deploy actually carry them? */
const dep=fs.readFileSync(ROOT+'/proposal-generator/deploy-to-portal.py','utf8');
const exts=dep.match(/INCLUDE_EXTS = \{([^}]*)\}/)[1];
ok('the deploy script ships .woff2', exts.includes('.woff2'), exts.trim());

console.log(fails?`\n${fails} FAILURES`:'\nfonts are installed, valid, declared and deployable');
process.exit(fails?1:0);
