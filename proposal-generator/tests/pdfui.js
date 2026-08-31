const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
const dom=new JSDOM('<body></body>',{url:'https://app.aurevya.com/proposal-generator/x.html'});
global.window=dom.window;global.document=dom.window.document;global.location=dom.window.location;
global.Blob=dom.window.Blob;global.URL=dom.window.URL;
/* jsdom implements neither, and without them the download throws and is
   swallowed by the error path — which is what hid the real result */
global.URL.createObjectURL=()=>'blob:stub';
global.URL.revokeObjectURL=()=>{};
eval([grab(/const PDF_HOST=[^\n]*/),
      grab(/const PDF_ENDPOINT=[\s\S]*?render-pdf';/),
      grab(/function pdfDefaultName\(\)\{[\s\S]*?\n\}/),
      grab(/function exportPDF\(\)\{[\s\S]*?\n\}/),
      grab(/function closePdfDialog\(\)\{[\s\S]*?\n\}/),
      grab(/async function runPdfExport\(\)\{[\s\S]*?\n\}/)].join('\n').replace(/^const /gm,'var '));

let PAGENO=21;global.PAGENO=PAGENO;
global.$=id=>document.getElementById(id);
global.exportFilename=()=>'AUREVYA_AC_Acme_Holdings_20260826_101500.html';
global.buildExportHTML=()=>'<html><body>deck</body></html>';
/* the export now embeds its fonts before sending */
global.buildSelfContainedHTML=async()=>'<html><body>deck</body></html>';
/* the export now sends the deck's settings, not a rebuilt document */
global.exportSnapshot=()=>({v:1,fields:{client:'Test'},state:{fees:{setup:[]}}});

let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

ok('served from the portal, the endpoint points at the API host',
   PDF_ENDPOINT==='https://aurevya-mcp-production.up.railway.app/api/render-pdf', PDF_ENDPOINT);
ok('  ...not at Netlify, whose catch-all would return the portal HTML',
   PDF_ENDPOINT!=='/api/render-pdf');
ok('the default name drops the .html extension', pdfDefaultName().endsWith('_101500'), pdfDefaultName());

exportPDF();
ok('a dialog opens', !!document.getElementById('pdfDialog'));
ok('the name is pre-filled and editable',
   document.getElementById('pdfName').value===pdfDefaultName());
ok('it says how many pages', document.getElementById('pdfDialog').textContent.includes('21 pages'));
ok('no browser print dialog is involved', !/window\.print/.test(exportPDF.toString()));

/* a successful render downloads under the typed name.

   The export is now two requests: the POST starts a job and answers at once,
   and the page collects the file from a second URL. It has to be, because a
   render takes long enough that a single held-open request gets closed in
   between and the browser reports that as a network failure. So the stub
   below is a little server, not a canned reply. */
let downloaded=null,posted=null,polls=0;
dom.window.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};
let stubJob={runningFor:0,fail:null};   /* how many polls answer "still working" */
const fakeServer=async(u,o)=>{
  if(o&&o.method==='POST'){
    posted={u,o};polls=0;
    return{ok:true,status:202,json:async()=>({jobId:'job-1'})};
  }
  polls++;
  if(polls<=stubJob.runningFor)
    return{ok:false,status:202,json:async()=>({status:'running',seconds:polls*2})};
  if(stubJob.fail)
    return{ok:false,status:500,json:async()=>({error:stubJob.fail})};
  return{ok:true,status:200,blob:async()=>new dom.window.Blob(['%PDF-1.4'],{type:'application/pdf'})};
};
global.fetch=fakeServer;
document.getElementById('pdfName').value='Acme Holdings — Proposal v2';
;(async()=>{
  await runPdfExport();
  ok('it posts to the render endpoint', posted&&posted.u===PDF_ENDPOINT, posted&&posted.u);
  ok('it sends the deck snapshot', JSON.parse(posted.o.body).snapshot.v===1);
  /* landscape is deliberately NOT sent: the page size read from the deck's
   own @page is already 297 wide by 186 tall, and asking for landscape on
   top of that swaps the two and crops every page */
ok('it does not ask for landscape', JSON.parse(posted.o.body).landscape===undefined);
ok('it does not ship a rebuilt document any more',
   JSON.parse(posted.o.body).html===undefined);
  ok('the file is saved under the typed name, as .pdf',
     downloaded==='Acme Holdings — Proposal v2.pdf', downloaded);
  ok('the dialog closes on success', !document.getElementById('pdfDialog'));

  /* characters a filesystem would reject are stripped */
  exportPDF();
  document.getElementById('pdfName').value='Q1/Q2: "final" <draft>?';
  await runPdfExport();
  ok('illegal filename characters are replaced',
     downloaded==='Q1_Q2_ _final_ _draft__.pdf'||!/[\\/:*?"<>|]/.test(downloaded), downloaded);

  /* an empty name falls back rather than saving ".pdf" */
  exportPDF();
  document.getElementById('pdfName').value='   ';
  await runPdfExport();
  ok('an empty name falls back to the default', downloaded===pdfDefaultName()+'.pdf', downloaded);

  /* a render that outlives several polls still arrives — the whole point of
     splitting the request in two */
  exportPDF();
  stubJob={runningFor:3,fail:null};
  document.getElementById('pdfName').value='Slow render';
  const seen=[];
  const watch=setInterval(()=>{const m=document.getElementById('pdfMsg');
    if(m&&m.textContent)seen.push(m.textContent);},50);
  await runPdfExport();
  clearInterval(watch);
  ok('a render that takes several polls still downloads',
     downloaded==='Slow render.pdf', downloaded);
  ok('  ...and it counts up while waiting',
     seen.some(t=>/Rendering .* \d+s/.test(t)), seen[seen.length-1]);
  stubJob={runningFor:0,fail:null};

  /* the server being down says so, and leaves the dialog open to retry */
  exportPDF();
  global.fetch=async()=>{throw new Error('Failed to fetch');};
  await runPdfExport();
  const msg=document.getElementById('pdfMsg');
  ok('a failure now reports the real error, not a guess',
     msg&&/Export failed/.test(msg.textContent)&&/Failed to fetch/.test(msg.textContent),
     msg&&msg.textContent.slice(0,72));
  ok('  ...and says where it was sent',
     msg&&msg.textContent.includes('render-pdf'));
  ok('the dialog stays open so it can be retried', !!document.getElementById('pdfDialog'));
  ok('the button is usable again', document.getElementById('pdfGo').disabled===false);

  /* a render failure reports the server's reason */
  global.fetch=fakeServer;
  stubJob={runningFor:0,fail:'Protocol error: Page crashed'};
  await runPdfExport();
  ok('a render failure shows the server\'s reason',
     /Page crashed/.test(document.getElementById('pdfMsg').textContent),
     document.getElementById('pdfMsg').textContent);

  /* the POST answering with something unusable is caught rather than
     leaving the dialog spinning for ever */
  stubJob={runningFor:0,fail:null};
  global.fetch=async(u,o)=>o&&o.method==='POST'
    ? {ok:true,status:202,json:async()=>({})} : fakeServer(u,o);
  await runPdfExport();
  ok('a POST that starts no job is reported, not waited on',
     /did not start/.test(document.getElementById('pdfMsg').textContent),
     document.getElementById('pdfMsg').textContent);

  console.log(fails?`\n${fails} FAILURES`:'\nthe export dialog behaves');
  process.exit(fails?1:0);
})();
