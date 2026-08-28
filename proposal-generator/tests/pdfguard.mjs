/* the request allowlist: the one thing standing between "render this HTML"
   and "fetch this internal address for me" */
import { pdfRequestAllowed } from '/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/mcp-server/lib/proposal.js';
let fails=0;
const ok=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)fails++;};

console.log('should be allowed — what the deck legitimately needs:');
[['file:///app/proposal-generator/assets/cover-photograph.png',1],
 ['data:image/png;base64,iVBORw0KGgo',1],
 ['about:blank',1],
 ['https://fonts.googleapis.com/css2?family=Cormorant+Garamond',1],
 ['https://fonts.gstatic.com/s/cormorantgaramond/v16/x.woff2',1],
].forEach(([u,e])=>ok('  '+u.slice(0,58), pdfRequestAllowed(u)===!!e));

console.log('\nshould be blocked — server-side request forgery and friends:');
[['http://169.254.169.254/latest/meta-data/',0],          // cloud metadata
 ['http://localhost:8080/internal',0],
 ['http://127.0.0.1:5432/',0],
 ['http://[::1]:6379/',0],
 ['http://10.0.0.5/admin',0],
 ['https://fonts.googleapis.com.evil.test/x',0],          // suffix trick
 ['https://evil.test/?x=fonts.googleapis.com',0],         // query trick
 ['https://raw.githubusercontent.com/x/y',0],
 ['ftp://internal/secrets',0],
 ['javascript:fetch("/x")',0],
 ['not a url at all',0],
 ['',0],
].forEach(([u,e])=>ok('  '+(u||'(empty)').slice(0,58), pdfRequestAllowed(u)===!!e));

console.log('\nnon-strings are refused rather than crashing:');
[null,undefined,42,{},[]].forEach(v=>ok('  '+JSON.stringify(v), pdfRequestAllowed(v)===false));

console.log(fails?`\n${fails} FAILURES`:'\nonly the deck\'s own resources and the font hosts get through');
process.exit(fails?1:0);
