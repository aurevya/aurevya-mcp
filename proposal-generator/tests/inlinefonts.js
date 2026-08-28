const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT='/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator';
const html=fs.readFileSync(ROOT+'/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
const dom=new JSDOM(html,{url:'https://app.aurevya.com/proposal-generator/proposal-generator.html'});
global.window=dom.window;global.document=dom.window.document;
global.btoa=s=>Buffer.from(s,'latin1').toString('base64');
global.Uint8Array=Uint8Array;

/* serve the real font files, as the browser would */
let served=[],failNext=null;
global.fetch=async(u)=>{
  served.push(u);
  if(failNext&&u.includes(failNext))return{ok:false,status:404};
  const p=path.join(ROOT,u);
  if(!fs.existsSync(p))return{ok:false,status:404};
  const b=fs.readFileSync(p);
  return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
};
eval([grab(/let FONT_DATA_CACHE=null;/),
      grab(/async function inlinedFonts\(\)\{[\s\S]*?\n\}/),
      grab(/async function buildSelfContainedHTML\(\)\{[\s\S]*?\n\}/),
      grab(/function buildExportHTML\(fontMap\)\{[\s\S]*?\n\}/)]
 .join('\n').replace(/^let FONT_DATA_CACHE/m,'var FONT_DATA_CACHE'));
global.currentSpec=()=>({label:'AC'});
global.$=id=>document.getElementById(id)||{value:'Test'};

let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};
(async()=>{
  const doc=await buildSelfContainedHTML();
  console.log('self-contained deck: %d KB\n', Math.round(doc.length/1024));

  ok('all nine faces were read', served.length===9, served.length+' files fetched');
  ok('no font still points at a file path',
     !/url\('assets\/fonts\//.test(doc));
  const uris=doc.match(/url\('data:font\/woff2;base64,/g)||[];
  ok('all nine are embedded as data URIs', uris.length===9, uris.length+' found');
  ok('the document has no external references',
     !/https?:\/\//.test(doc.replace(/xmlns="[^"]*"/g,'')));

  /* the bytes are the real font, not a truncated blob */
  const m=doc.match(/url\('data:font\/woff2;base64,([^']+)'\)/);
  const head=Buffer.from(m[1].slice(0,8),'base64').subarray(0,4).toString('latin1');
  ok('the embedded bytes are genuine woff2', head==='wOF2', JSON.stringify(head));
  const rebuilt=Buffer.from(m[1],'base64');
  const onDisk=fs.readFileSync(path.join(ROOT,served[0]));
  ok('  ...and byte-identical to the file on disk',
     rebuilt.length===onDisk.length&&rebuilt.equals(onDisk),
     rebuilt.length+' bytes');

  /* cached: exporting twice must not re-read them */
  const n=served.length;
  await buildSelfContainedHTML();
  ok('a second export reuses the cache', served.length===n);

  /* a missing font is reported, not silently dropped */
  FONT_DATA_CACHE=null; served=[]; failNext='RivieraNights-Bold';
  let err=null;
  try{ await buildSelfContainedHTML(); }catch(e){ err=e.message; }
  ok('a font that cannot be read raises, rather than exporting in Times',
     err&&/Could not read.*RivieraNights-Bold/.test(err), err);

  console.log(fails?`\n${fails} FAILURES`:'\nthe exported deck carries its own fonts');
  process.exit(fails?1:0);
})();
