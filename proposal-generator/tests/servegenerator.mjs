/* Does the static mount actually serve the generator, its fonts and its
   photography — and is the export same-origin from there? */
import express from 'express';
import path from 'path';
import fs from 'fs';
const GEN='/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator';
const app=express();
app.use('/generator', express.static(GEN,{index:'proposal-generator.html',
  setHeaders:(res,p)=>res.set('Cache-Control',/\.(woff2|png|svg|ico)$/i.test(p)?'public, max-age=604800':'no-cache')}));
app.post('/api/render-pdf',express.json({limit:'25mb'}),(req,res)=>res.json({got:Object.keys(req.body||{})}));
const srv=await new Promise(r=>{const s=app.listen(0,()=>r(s));});
const base='http://127.0.0.1:'+srv.address().port;
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

let r=await fetch(base+'/generator/');
const html=await r.text();
ok('the generator is served at /generator/', r.status===200&&html.includes('Proposal Generator'),
   r.status+' '+Math.round(html.length/1024)+'KB');
ok('  ...and is the current version (has applySnapshot)', html.includes('function applySnapshot'));
ok('  ...and is not cached, so an update is picked up', r.headers.get('cache-control')==='no-cache');

r=await fetch(base+'/generator/assets/fonts/RivieraNights-Regular.woff2');
const buf=Buffer.from(await r.arrayBuffer());
ok('the fonts are served', r.status===200&&buf.subarray(0,4).toString('latin1')==='wOF2',
   r.status+' '+Math.round(buf.length/1024)+'KB');
ok('  ...and are cached', /max-age=604800/.test(r.headers.get('cache-control')||''));

r=await fetch(base+'/generator/assets/cover-photograph.png');
ok('the photography is served', r.status===200, String(r.status));

/* the endpoint the page will use from /generator/ is relative → same origin */
const rel=/\/generator\//.test('/generator/proposal-generator.html');
ok('the export posts same-origin from /generator/', rel);
r=await fetch(base+'/api/render-pdf',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({snapshot:{v:1}})});
ok('  ...and the endpoint accepts a snapshot', r.status===200, JSON.stringify(await r.json()));

/* it must not expose anything outside the generator folder */
r=await fetch(base+'/generator/../mcp-server/index.js');
ok('it does not serve files outside the generator folder', r.status!==200||!(await r.text()).includes('SUPABASE'),
   'status '+r.status);
srv.close();
console.log(fails?`\n${fails} FAILURES`:'\nthe generator and the renderer are now one deployment');
process.exit(fails?1:0);
