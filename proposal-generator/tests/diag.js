const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
eval([grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/function feeUnitAt\(list,idx\)\{[\s\S]*?\n\}/)].join('\n').replace(/^const /gm,'var '));
const L=composeFees(['ac'],'setup');
console.log('The Setup list as the user sees it, and what each row drags:\n');
L.forEach((r,i)=>{
  const u=feeUnitAt(L,i);
  const span=u.end-u.start;
  console.log(String(i).padStart(2)+'  '+(r.t+'      ').slice(0,6)+'  '+
    String(r.l).slice(0,34).padEnd(36)+
    'drags rows '+u.start+'–'+(u.end-1)+(span>1?'  ('+span+' rows!)':''));
});
