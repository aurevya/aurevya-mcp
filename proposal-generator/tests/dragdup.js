/* the bug that would have made this misbehave in the browser: handlers
   stacking up because the tbody survives every render */
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
const dom=new JSDOM('<table><tbody id="feeSetup"></tbody></table>');
global.window=dom.window;global.document=dom.window.document;
eval([grab(/let FEE_DRAG=null;/),grab(/function wireFeeDrag\(tb\)\{[\s\S]*?\n\}/)]
  .join('\n').replace(/^let FEE_DRAG/m,'var FEE_DRAG'));
const tb=document.getElementById('feeSetup');
let added=0;const orig=tb.addEventListener.bind(tb);
tb.addEventListener=(...a)=>{added++;return orig(...a);};
for(let i=0;i<20;i++)wireFeeDrag(tb);
console.log('wireFeeDrag called 20 times; listeners attached:',added);
const ok=added===1;
console.log(ok?'PASS  wired exactly once':'FAIL  '+added+' listener sets stacked up');
process.exit(ok?0:1);
