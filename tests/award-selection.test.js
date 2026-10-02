const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
function extract(start, end) {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a);
  return source.slice(a,b);
}
function harness({cancel=false, fieldKey="name"}={}) {
  const calls={payloads:[],writes:[],cacheRead:0,cacheWrite:0,selection:0,scanScopes:[]};
  const runtime=[
    {fieldId:'existing',kind:'input',el:{value:'已有奖项'}},
    {fieldId:'new',kind:'input',el:{value:''}},
    {fieldId:'wrong',kind:'input',el:{value:''}},
    {fieldId:'other',kind:'input',el:{value:''}},
  ];
  const ctx={window:{},console,URL,structuredClone,
    location:{href:'https://example.com/form',host:'example.com',pathname:'/form'}, document:{title:'Awards'},
    diagnostics:new Proxy({}, {get:()=>()=>''}), sendLog(){},sendStats(){},
    requestSelectionRect:async()=>{calls.selection++;return cancel?null:{left:0,top:0,width:400,height:200};},
    triggerExpandableSections:async()=>{throw new Error('Targeted fill must not expand the whole page');},
    scanFields:opts=>{calls.scanScopes.push(opts.scope);return {fields:runtime.map(r=>({fieldId:r.fieldId,label:'奖项名称'})),runtime};},
    createMappingCacheSignature:()=>({same:true}),createMappingCacheKeyFromSignature:()=> 'same',
    loadMappingCacheEntry:async()=>{calls.cacheRead++;return {entry:{mappings:[{fieldId:'new',resumePath:'awards.0.name'}]}};},
    saveMappingCacheEntry:async()=>{calls.cacheWrite++;},
    parseJsonFromAiText:JSON.parse,
    aiClient:{callAI:async(_id,prompt)=>{
      const payload=JSON.parse(prompt);calls.payloads.push(payload);
      const prefix=payload.mappingScope.allowedPathPrefix;
      return JSON.stringify({mappings:[
        {fieldId:'existing',resumePath:prefix+fieldKey},
        {fieldId:'new',resumePath:prefix+fieldKey},
        {fieldId:'wrong',resumePath:'awards.9.name'},
        {fieldId:'other',resumePath:'personal.fullName'},
      ]});
    }},
    fillOne:async(r,value,opts)=>{calls.writes.push({id:r.fieldId,value,overwrite:opts.overwrite});r.el.value=value;return {filled:true};},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared/resume-schema.js'),'utf8'),ctx);
  vm.runInContext(`
    const schema=window.ResumeSchema;
    let isWorking=false,lastFieldCount=0,lastMappedCount=0,lastFilledCount=0;
    const fieldRuntimeMap=new Map();
    ${extract('async function handleStartFill(', 'function normalizeDeepScanText(')}
    ${extract('function buildFieldMappingPayload(', 'async function requestSelectionRect(')}
    ${extract('function hasExistingFieldValue(', 'async function fillOne(')}
    globalThis.run=handleStartFill;
  `,ctx);
  const profile=ctx.window.ResumeSchema.normalizeResumeProfile({personal:{fullName:'Never use this'},awards:[{name:'奖项甲'},{name:'奖项乙'}]});
  return {ctx,calls,runtime,profile};
}
test('selected award fills only its paths, preserves existing values and bypasses general caches',async()=>{
 const h=harness();
 const result=await h.ctx.run('test',h.profile,{awardIndex:1,scope:'page',fillMode:'overwrite'});
 assert.equal(result.filledCount,1);
 assert.equal(result.cacheHit,false);
 assert.equal(h.runtime[0].el.value,'已有奖项');
 assert.deepEqual(h.calls.writes,[{id:'new',value:'奖项乙',overwrite:false}]);
 assert.deepEqual(h.calls.scanScopes,['selection']);
 assert.equal(h.calls.cacheRead,0);assert.equal(h.calls.cacheWrite,0);
 assert.ok(h.calls.payloads[0].resumeFields.every(f=>f.path.startsWith('awards.1.')));
 assert.equal(h.runtime[2].el.value,'');assert.equal(h.runtime[3].el.value,'');
});
test('changing the selected award on the same form uses the new record',async()=>{
 const h=harness();
 await h.ctx.run('test',h.profile,{awardIndex:1});
 h.runtime[1].el.value='';
 await h.ctx.run('test',h.profile,{awardIndex:0});
 assert.equal(h.calls.writes[1].value,'奖项甲');
 assert.equal(h.calls.payloads.length,2);
 assert.equal(h.calls.cacheRead,0);
});
test('canceling award selection does not call AI or write any field',async()=>{
 const h=harness({cancel:true});
 const result=await h.ctx.run('test',h.profile,{awardIndex:1});
 assert.equal(result.canceled,true);
 assert.equal(h.calls.payloads.length,0);assert.equal(h.calls.writes.length,0);
});
test('invalid or removed award selections fail before scanning',async()=>{
 const h=harness();
 for (const awardIndex of [-1,2,0.5,'1']) {
   await assert.rejects(h.ctx.run('test',h.profile,{awardIndex}),/所选奖项无效/);
 }
 assert.equal(h.calls.selection,0);assert.equal(h.calls.payloads.length,0);
});


test('every list category restricts mapping and writes to the selected second record', async () => {
  const base = harness();
  for (const section of base.ctx.window.ResumeSchema.sections.filter(s => s.type === 'list')) {
    const key = section.fields.find(field => field.input === "text").key;
    const h = harness({fieldKey:key});
    h.profile = h.ctx.window.ResumeSchema.normalizeResumeProfile({
      personal:{fullName:'Not selected'},
      [section.key]:[{[key]:'第一条'}, {[key]:'第二条'}],
    });
    const result = await h.ctx.run('test',h.profile,{recordSelection:{section:section.key,index:1},scope:'page',fillMode:'overwrite'});
    assert.equal(result.filledCount,1,section.key);
    assert.equal(h.calls.writes[0].value,'第二条',section.key);
    assert.equal(h.runtime[0].el.value,'已有奖项');
    assert.equal(h.runtime[2].el.value,'');assert.equal(h.runtime[3].el.value,'');
    assert.ok(h.calls.payloads[0].resumeFields.every(f=>f.path.startsWith(`${section.key}.1.`)));
    assert.equal(h.calls.cacheRead,0);assert.equal(h.calls.cacheWrite,0);
    assert.deepEqual(h.calls.scanScopes,['selection']);
  }
});

test('invalid category, index, or empty record is rejected before selection or model calls', async () => {
  const h=harness();
  for (const recordSelection of [{section:'personal',index:0},{section:'__proto__',index:0},{section:'awards',index:2},{section:'awards',index:'1'},{section:'awards',index:-1},{section:'projects',index:0},{}]) {
    await assert.rejects(h.ctx.run('test',h.profile,{recordSelection}),/所选记录无效/);
  }
  assert.equal(h.calls.selection,0);assert.equal(h.calls.payloads.length,0);
});

test('record options omit empty placeholders and preserve original indices and distinguishing labels', () => {
  const h=harness(), schema=h.ctx.window.ResumeSchema;
  const p=schema.normalizeResumeProfile({familyMembers:[{}, {relationship:'母亲',name:'测试成员'}],publications:[{title:'测试论文',venue:'测试期刊',status:'已录用'}]});
  const choices=schema.getRecordChoices(p,'familyMembers');
  assert.equal(choices.length,1);assert.equal(choices[0].index,1);
  assert.match(choices[0].label,/母亲.*测试成员/);
  assert.match(schema.getRecordChoices(p,'publications')[0].label,/测试论文.*已录用/);
});
