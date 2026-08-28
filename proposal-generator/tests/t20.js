/* t20 — re-alignment after a delete, and adding shareholders from the panel */
const fs=require('fs');
const html=fs.readFileSync('/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html','utf8');
function grab(re){const m=html.match(re); if(!m) throw new Error('MISSING '+re); return m[0];}
eval([
 grab(/const ENTITY_META = \{[\s\S]*?\n\};/),
 grab(/function companyCount\(ent\)\{[\s\S]*?\n\}/),
 grab(/const PRICEBOOK = \{[\s\S]*?\n\};/),
 grab(/const DISB_RE=[^\n]*/),
 grab(/function regroupDisbursements\(rows\)\{[\s\S]*?\n\}/),
 grab(/function composeFees\(keys,which,tagFor\)\{[\s\S]*?\n\}/),
 grab(/const NODE_DIM=[^\n]*/),
 grab(/function nodeDim\(n\)\{[\s\S]*?\n\}/),
 grab(/const RELAYOUT_GAP_Y=[^\n]*/),
 grab(/function realignStructure\(st\)\{[\s\S]*?\n\}/),
 grab(/function isAncestor\(parentOf,nodeId,candidateId\)\{[\s\S]*?\n\}/),
 grab(/function layoutShareholderRow\(st\)\{[\s\S]*?\n\}/),
 grab(/function addShareholderFor\(id\)\{[\s\S]*?\n\}/),
 grab(/function descendants\(st,id,seen\)\{[\s\S]*?\n\}/),
 grab(/function layoutChildren\(st,parentId\)\{[\s\S]*?\n\}/),
 grab(/function companyBoxes\(\)\{[\s\S]*?\n\}/),
 grab(/function renumberCompanyBoxes\(\)\{[\s\S]*?\n\}/),
 grab(/function usesFeeCols\(\)\{[\s\S]*?\n\}/),
 grab(/function feeColIndexForNode\(id\)\{[\s\S]*?\n\}/),
 grab(/function allFeeLists\(which\)\{[\s\S]*?\n\}/),
 grab(/function removeStructNode\(id\)\{[\s\S]*?\n\}/),
 grab(/const CORE_NODE_IDS=[^\n]*/),
 grab(/function feeColLabel\(ent,index\)\{[\s\S]*?\n\}/),
].join('\n'));

let seq=0;
global.newStructId=()=>'n'+(++seq);
global.renderFeeEditor=()=>{};global.liveBuild=()=>{};global.openEntityPanel=()=>{};
global.renderStructEditorUI=()=>{};global.redrawStructure=()=>{};global.syncEntityNames=()=>{};
global.syncExtraKinds=()=>{};global.renderSectionToggles=()=>{};global.syncCellFees=()=>{};
global.$=()=>null;
global.STATE={mode:'structure',entities:{company:'ac',companyCount:1,trust:false,cis:false},
  fees:{setup:[],fixed:[]},feeCols:[],extraKinds:[],struct:null};

let fails=0;
function ok(label,cond,extra){
  console.log((cond?'PASS  ':'FAIL  ')+label+(extra!==undefined?'   '+extra:''));
  if(!cond)fails++;
}
const cx=n=>n.x+nodeDim(n).w/2;

/* ── 1. one of two siblings deleted: the survivor re-centres ───────── */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'sh',kind:'shareholder',label:'SHAREHOLDER',x:64.5,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:63.5,y:44},
    {id:'k1',kind:'box',entKey:'trust',label:'TRUST',x:35,y:80},
    {id:'k2',kind:'box',entKey:'trust',label:'TRUST',x:91,y:80}
  ],edges:[
    {id:'e0',from:'sh',to:'ac',label:''},
    {id:'e1',from:'ac',to:'k1',label:'100%'},
    {id:'e2',from:'ac',to:'k2',label:'100%'}
  ]};
  STATE.struct=st;
  const before=Math.abs(cx(st.nodes[2])-cx(st.nodes[1]));
  removeStructNode('k2');
  const surv=st.nodes.find(n=>n.id==='k1');
  const parent=st.nodes.find(n=>n.id==='ac');
  console.log('\n=== one of two children deleted ===');
  ok('survivor was off-centre before', before>10, before.toFixed(1)+'mm off');
  ok('survivor now centred under its parent', Math.abs(cx(surv)-cx(parent))<0.6,
     Math.abs(cx(surv)-cx(parent)).toFixed(2)+'mm');
  ok('shareholder still centred over the company', Math.abs(cx(st.nodes[0])-cx(parent))<0.6);
  ok('one edge left from the parent', st.edges.filter(e=>e.from==='ac').length===1);
})();

/* ── 2. one of two shareholders deleted: the row re-centres ────────── */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'s1',kind:'shareholder',label:'PARTNER A',pct:'51%',x:38,y:10},
    {id:'s2',kind:'shareholder',label:'PARTNER B',pct:'49%',x:90,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:63.5,y:52}
  ],edges:[
    {id:'e1',from:'s1',to:'ac',label:''},
    {id:'e2',from:'s2',to:'ac',label:''}
  ]};
  STATE.struct=st;
  removeStructNode('s2');
  const s1=st.nodes.find(n=>n.id==='s1'),ac=st.nodes.find(n=>n.id==='ac');
  console.log('\n=== one of two shareholders deleted ===');
  ok('survivor re-centres over the company', Math.abs(cx(s1)-cx(ac))<0.6,
     'Δ '+Math.abs(cx(s1)-cx(ac)).toFixed(2)+'mm');
  ok('no stale edge to the deleted block', !st.edges.some(e=>e.from==='s2'||e.to==='s2'));
})();

/* ── 3. canvas height shrinks back after a deep box goes ──────────── */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'sh',kind:'shareholder',label:'SHAREHOLDER',x:64.5,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:63.5,y:44},
    {id:'d1',kind:'box',entKey:'trust',label:'TRUST',x:63.5,y:80},
    {id:'d2',kind:'box',entKey:'other',label:'ENTITY',x:63.5,y:116},
    {id:'d3',kind:'box',entKey:'other',label:'ENTITY',x:63.5,y:152}
  ],edges:[
    {id:'e0',from:'sh',to:'ac'},{id:'e1',from:'ac',to:'d1'},
    {id:'e2',from:'d1',to:'d2'},{id:'e3',from:'d2',to:'d3'}
  ]};
  st.canvasH=210;
  STATE.struct=st;
  removeStructNode('d3');
  removeStructNode('d2');
  const lowest=st.nodes.reduce((m,n)=>Math.max(m,n.y+nodeDim(n).h),0);
  console.log('\n=== canvas height after trimming a chain ===');
  ok('canvas shrank back', st.canvasH<210, st.canvasH+'mm (was 210)');
  ok('canvas still clears the content', st.canvasH>=lowest, st.canvasH+' >= '+lowest.toFixed(1));
  ok('chain reconnected, no orphan', st.edges.filter(e=>e.to==='d1').length===1);
})();

/* ── 4. rows stay evenly spaced, no overlap, after realignment ─────── */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'sh',kind:'shareholder',label:'SHAREHOLDER',x:0,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:0,y:44},
    {id:'a',kind:'box',entKey:'other',label:'A',x:0,y:90},
    {id:'b',kind:'box',entKey:'other',label:'B',x:0,y:90},
    {id:'c',kind:'box',entKey:'other',label:'C',x:0,y:90},
    {id:'junk',kind:'box',entKey:'other',label:'JUNK',x:150,y:130}
  ],edges:[
    {id:'e0',from:'sh',to:'ac'},
    {id:'e1',from:'ac',to:'a'},{id:'e2',from:'ac',to:'b'},
    {id:'e3',from:'ac',to:'c'},{id:'e4',from:'c',to:'junk'}
  ]};
  STATE.struct=st;
  removeStructNode('junk');
  const kids=['a','b','c'].map(i=>st.nodes.find(n=>n.id===i));
  const ac=st.nodes.find(n=>n.id==='ac');
  console.log('\n=== three siblings after realignment ===');
  ok('all three share a row', kids.every(k=>Math.abs(k.y-kids[0].y)<0.01));
  const sorted=kids.slice().sort((p,q)=>p.x-q.x);
  let clear=true;
  for(let i=1;i<sorted.length;i++){
    if(sorted[i].x < sorted[i-1].x+nodeDim(sorted[i-1]).w) clear=false;
  }
  ok('no two boxes overlap', clear);
  const span=(sorted[2].x+nodeDim(sorted[2]).w+sorted[0].x)/2;
  ok('parent centred over the row', Math.abs(cx(ac)-span)<0.6, 'Δ '+Math.abs(cx(ac)-span).toFixed(2)+'mm');
  ok('everything inside the canvas',
     st.nodes.every(n=>n.x>=0&&n.x+nodeDim(n).w<=st.canvasW+0.01));
})();

/* ── 5. adding a shareholder from a shareholder joins the same entity ─ */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'sh',kind:'shareholder',label:'SHAREHOLDER',x:64.5,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:63.5,y:44}
  ],edges:[{id:'e0',from:'sh',to:'ac',label:''}]};
  STATE.struct=st;
  addShareholderFor('sh');
  const sh=st.nodes.filter(n=>n.kind==='shareholder');
  const ac=st.nodes.find(n=>n.id==='ac');
  console.log('\n=== + shareholder from a shareholder ===');
  ok('a second block was added', sh.length===2);
  ok('it feeds the same entity',
     st.edges.filter(e=>e.to==='ac'&&sh.some(s=>s.id===e.from)).length===2);
  ok('both sit on the same line', Math.abs(sh[0].y-sh[1].y)<0.01);
  const rowMid=(Math.min(sh[0].x,sh[1].x)+Math.max(sh[0].x+nodeDim(sh[0]).w,sh[1].x+nodeDim(sh[1]).w))/2;
  ok('row centred over the company', Math.abs(rowMid-cx(ac))<0.6,
     'Δ '+Math.abs(rowMid-cx(ac)).toFixed(2)+'mm');
  ok('they do not overlap',
     Math.abs(sh[0].x-sh[1].x)>=nodeDim(sh[0]).w);
})();

/* ── 6. adding a shareholder from an entity box holds that box ─────── */
(function(){
  const st={canvasW:175,canvasH:150,nodes:[
    {id:'sh',kind:'shareholder',label:'SHAREHOLDER',x:64.5,y:10},
    {id:'ac',kind:'box',label:'AUTHORISED<br>COMPANY',x:63.5,y:44},
    {id:'sub',kind:'box',entKey:'other',label:'SUBSIDIARY',x:63.5,y:80}
  ],edges:[{id:'e0',from:'sh',to:'ac',label:''},{id:'e1',from:'ac',to:'sub',label:'100%'}]};
  STATE.struct=st;
  addShareholderFor('sub');
  const holders=st.edges.filter(e=>e.to==='sub'&&
    (st.nodes.find(n=>n.id===e.from)||{}).kind==='shareholder');
  console.log('\n=== + shareholder from an entity box ===');
  ok('the new block holds that box', holders.length===1);
  ok('the original owner edge survives',
     st.edges.some(e=>e.from==='ac'&&e.to==='sub'));
  const nw=st.nodes.find(n=>n.id===holders[0].from);
  const sub=st.nodes.find(n=>n.id==='sub');
  ok('it is centred over the box it holds', Math.abs(cx(nw)-cx(sub))<0.6);
  ok('the unrelated shareholder was not dragged into that row',
     Math.abs(cx(st.nodes.find(n=>n.id==='sh'))-cx(st.nodes.find(n=>n.id==='ac')))<0.6);
})();

console.log(fails?'\n'+fails+' FAILURES':'\nall assertions pass');
process.exit(fails?1:0);
