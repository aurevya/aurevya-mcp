/* Reproduce the failure, then prove the fix: an oversized body must come
   back as a readable JSON error WITH cors headers, not a bare 413. */
import express from 'express';
function build(limit, withHandler){
  const app=express();
  app.use(express.json({limit}));
  const cors=(req,res)=>{const o=req.headers.origin;if(o){res.set('Access-Control-Allow-Origin',o);}return true;};
  if(withHandler){
    app.use((err,req,res,next)=>{
      if(!err||!req.path.startsWith('/api/'))return next(err);
      cors(req,res);
      const big=err.type==='entity.too.large'||err.status===413;
      res.status(big?413:400).json({error:big?'That deck is too large to send for rendering.':'bad'});
    });
  }
  app.post('/api/render-pdf',(req,res)=>{cors(req,res);res.json({ok:true,bytes:JSON.stringify(req.body).length});});
  return app;
}
const payload=JSON.stringify({html:'x'.repeat(324*1024)});   // the inlined deck
async function probe(app,label){
  const srv=await new Promise(r=>{const s=app.listen(0,()=>r(s));});
  const port=srv.address().port;
  const res=await fetch(`http://127.0.0.1:${port}/api/render-pdf`,{
    method:'POST',headers:{'Content-Type':'application/json','Origin':'https://app.aurevya.com'},body:payload});
  const cors=res.headers.get('access-control-allow-origin');
  let body='';try{body=JSON.stringify(await res.json()).slice(0,58);}catch(e){body='(not JSON)';}
  console.log(`${label.padEnd(42)} ${res.status}  cors:${(cors||'NONE').padEnd(24)} ${body}`);
  srv.close();
  return {status:res.status,cors};
}
console.log('payload: %d KB\n', Math.round(payload.length/1024));
const before=await probe(build('100kb',false),'default 100kb, no handler (BEFORE)');
const after =await probe(build('25mb', true ),'25mb + error handler (AFTER)');
const guard =await probe(build('100kb',true ),'still too big, but handled');
let fails=0;
const ok=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)fails++;};
console.log();
ok('the old setup rejects the deck', before.status===413);
ok('  ...with no CORS header, so the browser sees only a network error', !before.cors);
ok('the new limit accepts it', after.status===200);
ok('and an over-limit body still returns a readable reason', guard.status===413&&!!guard.cors);
console.log(fails?`\n${fails} FAILURES`:'\nthe size limit was the failure, and it now reports itself');
process.exit(fails?1:0);
