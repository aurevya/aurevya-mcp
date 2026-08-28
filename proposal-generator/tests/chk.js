const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
const b=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
let bad=0; b.forEach((m,i)=>{try{new vm.Script(m[1]);}catch(e){bad++;console.log('FAIL block',i,e.message);}});
console.log(bad?'SYNTAX ERRORS':'all '+b.length+' script blocks parse OK'); process.exit(bad?1:0);
