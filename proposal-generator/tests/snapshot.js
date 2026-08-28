/* Capture a deck, apply it into a fresh copy of the page, and check the
   second copy is the same deck — including hand edits. */
const fs=require('fs');const {JSDOM}=require('jsdom');
const SRC='/sessions/clever-brave-hamilton/mnt/Aurevya Portal/AWL AI Automation/proposal-generator/proposal-generator.html';
const html=fs.readFileSync(SRC,'utf8');
const grab=re=>{const m=html.match(re);if(!m)throw new Error('MISSING '+re);return m[0];};
let fails=0;const ok=(l,c,x)=>{console.log((c?'PASS  ':'FAIL  ')+l+(x!==undefined?'   '+x:''));if(!c)fails++;};

/* exportSnapshot / applySnapshot exercised against a stand-in page */
const dom=new JSDOM('<div id="x"></div>');
global.window=dom.window;global.document=dom.window.document;
const fields={fMode:'structure',fCompany:'ac',fCompanyCount:'2',fClient:'Acme Ltd',
              fMonth:'7',fYear:'2026',fCurrency:'USD'};
const checks={fTrust:true,fCis:false,fNominee:true,fFeeCombined:false};
const els={};
Object.entries(fields).forEach(([k,v])=>{const e=document.createElement('input');e.value=v;els[k]=e;});
Object.entries(checks).forEach(([k,v])=>{const e=document.createElement('input');e.type='checkbox';e.checked=v;els[k]=e;});
global.$=id=>els[id];
global.STATE={mode:'structure',entities:{company:'ac',companyCount:2,trust:true,cis:false},
  fees:{setup:[{t:'grp',l:'MOVED GROUP'},{t:'item',l:'Hand edited line',v:4242}],fixed:[]},
  feeCols:[{nodeId:'ac1',label:'AC 1',setup:[],fixed:[]}],
  sections:{disclaimer:true,contents:true,kyc:false},
  struct:{canvasW:175,canvasH:150,nodes:[{id:'sh',kind:'shareholder',label:'PARTNER A',pct:'51%'}],edges:[]},
  extraKinds:['gbc']};
eval(grab(/function exportSnapshot\(\)\{[\s\S]*?\n\}/));
const snap=exportSnapshot();

ok('the snapshot carries the sidebar fields',
   snap.fields.client==='Acme Ltd'&&snap.fields.companyCount==='2'&&snap.fields.trust===true,
   JSON.stringify(snap.fields).slice(0,70)+'...');
ok('  ...and the edited fee list', snap.state.fees.setup[1].l==='Hand edited line');
ok('  ...and the per-entity columns', snap.state.feeCols[0].label==='AC 1');
ok('  ...and the structure diagram', snap.state.struct.nodes[0].pct==='51%');
ok('  ...and which sections are ticked', snap.state.sections.kyc===false);
ok('  ...and canvas-added entity kinds', snap.state.extraKinds[0]==='gbc');
ok('it is a copy, not a live reference',
   (()=>{STATE.fees.setup[1].v=999;return snap.state.fees.setup[1].v===4242;})());
const size=JSON.stringify(snap).length;
ok('it is small enough to post comfortably', size<200000, Math.round(size/1024)+' KB');

/* now apply it into a fresh page and confirm the state comes back */
const els2={};
Object.keys(fields).forEach(k=>{const e=document.createElement('input');e.value='';els2[k]=e;});
Object.keys(checks).forEach(k=>{const e=document.createElement('input');e.type='checkbox';els2[k]=e;});
global.$=id=>els2[id];
global.STATE={mode:'structure',entities:{},fees:{setup:[],fixed:[]},feeCols:[],sections:{},struct:{},extraKinds:[]};
let built=false;
global.build=()=>{built=true;};
global.onModeOrEntityChange=()=>{};       // the real one needs the whole page
global.renderSectionToggles=()=>{};global.renderFeeEditor=()=>{};global.renderStructEditorUI=()=>{};
eval(grab(/function applySnapshot\(s\)\{[\s\S]*?\n\}/));
const okApply=applySnapshot(snap);

ok('applying it succeeds', okApply===true);
ok('  ...restores the sidebar fields', els2.fClient.value==='Acme Ltd'&&els2.fCompanyCount.value==='2');
ok('  ...restores the checkboxes', els2.fTrust.checked===true&&els2.fNominee.checked===true);
ok('  ...restores the edited fee list', STATE.fees.setup[1].l==='Hand edited line');
ok('  ...restores the diagram', STATE.struct.nodes[0].label==='PARTNER A');
ok('  ...restores section choices', STATE.sections.kyc===false);
ok('  ...and redraws the deck', built===true);
ok('a malformed snapshot is refused', applySnapshot(null)===false&&applySnapshot({})===false);

console.log(fails?`\n${fails} FAILURES`:'\na snapshot reproduces the deck, hand edits included');
process.exit(fails?1:0);
