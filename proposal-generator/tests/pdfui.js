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
global.buildSelfContainedHTML=async()=>'<html><body>deck @font-face data:font/woff2</body></html>';

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

/* a successful render downloads under the typed name */
let downloaded=null,posted=null;
dom.window.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};
global.fetch=async(u,o)=>{posted={u,o};return{ok:true,blob:async()=>new dom.window.Blob(['%PDF-1.4'],{type:'application/pdf'})};};
document.getElementById('pdfName').value='Acme Holdings — Proposal v2';
;(async()=>{
  await runPdfExport();
  ok('it posts to the render endpoint', posted&&posted.u===PDF_ENDPOINT, posted&&posted.u);
  ok('it sends the deck HTML', JSON.parse(posted.o.body).html.includes('deck'));
  /* landscape is deliberately NOT sent: the page size read from the deck's
   own @page is already 297 wide by 186 tall, and asking for landscape on
   top of that swaps the two and crops every page */
ok('it does not ask for landscape', JSON.parse(posted.o.body).landscape===undefined);
ok('it sends a self-contained document',
   /data:font\/woff2/.test(JSON.parse(posted.o.body).html));
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

  /* the server being down says so, and leaves the dialog open to retry */
  exportPDF();
  global.fetch=async()=>{throw new Error('Failed to fetch');};
  await runPdfExport();
  const msg=document.getElementById('pdfMsg');
  ok('an unreachable server is reported plainly',
     msg&&/Could not reach the PDF service/.test(msg.textContent), msg&&msg.textContent);
  ok('the dialog stays open so it can be retried', !!document.getElementById('pdfDialog'));
  ok('the button is usable again', document.getElementById('pdfGo').disabled===false);

  /* a render failure reports the server's reason */
  global.fetch=async()=>({ok:false,status:500,json:async()=>({error:'Protocol error: Page crashed'})});
  await runPdfExport();
  ok('a render failure shows the reason',
     /Page crashed/.test(document.getElementById('pdfMsg').textContent),
     document.getElementById('pdfMsg').textContent);

  console.log(fails?`\n${fails} FAILURES`:'\nthe export dialog behaves');
  process.exit(fails?1:0);
})();
