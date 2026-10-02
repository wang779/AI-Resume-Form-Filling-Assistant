const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../..');
const formHtml=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>奖项填写测试</title><style>body{font:16px sans-serif;padding:30px}fieldset{width:550px;margin:20px;padding:20px}label{display:block;margin:12px}input{display:block;width:90%;padding:8px;margin-top:6px}</style><h1>奖项填写测试</h1><fieldset id="old"><legend>已保存的奖项</legend><label>奖项名称<input id="oldName" value="已填奖项，不应修改"></label></fieldset><fieldset id="new"><legend>新增奖项</legend><label>奖项名称<input id="newName"></label><label>获奖日期<input id="newDate" type="date"></label><label>颁发单位<input id="newIssuer" value="保留已有单位"></label></fieldset></html>`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/test-awards'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(formHtml);}
 const name=url.pathname.slice(1);
 if(!/^(popup\.(html|css|js)|content\.(css|js)|shared\/[a-z-]+\.js|libs\/pdfjs\/pdf\.min\.js|icons\/icon128\.png)$/.test(name)){res.statusCode=404;return res.end();}
 const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png'};
 res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(fs.readFileSync(path.join(root,name)));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try {
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
  const context=await browser.newContext();
  const form=await context.newPage();await form.setViewportSize({width:1000,height:850});
  const errors=[];form.on('pageerror',e=>errors.push(e.message));
  await form.goto(base+'/test-awards');
  await form.evaluate(()=>{
   window.__handlers=[];window.__aiPayloads=[];window.__cache={};
   window.chrome={runtime:{onMessage:{addListener:fn=>window.__handlers.push(fn)},sendMessage:(msg,cb)=>{
    let result={success:true};
    if(msg.action==='callAI'){
      const p=JSON.parse(msg.prompt);window.__aiPayloads.push(p);
      const prefix=p.mappingScope.allowedPathPrefix;
      result.data=JSON.stringify({mappings:p.fields.map(f=>({fieldId:f.fieldId,resumePath:prefix+(f.label.includes('日期')?'awardDate':f.label.includes('单位')?'issuer':p.mappingScope.section==='publications'?'title':'name')}))});
    }
    cb?.(result);return Promise.resolve(result);
   }},storage:{local:{get:async keys=>Object.fromEntries(keys.filter(k=>k in window.__cache).map(k=>[k,window.__cache[k]])),set:async values=>Object.assign(window.__cache,values)}}};
  });
  await form.addStyleTag({path:path.join(root,'content.css')});
  for(const file of ['shared/resume-schema.js','shared/diagnostics.js','shared/field-text.js','shared/field-semantics.js','shared/fill-runtime.js','shared/content-bridge.js','shared/ai-client.js','content.js']) await form.addScriptTag({path:path.join(root,file)});
  const popup=await context.newPage();await popup.setViewportSize({width:430,height:1000});popup.on('pageerror',e=>errors.push(e.message));
  await popup.exposeFunction('__sendToContent',msg=>form.evaluate(message=>new Promise(resolve=>window.__handlers[0](message,{},resolve)),msg));
  await popup.addInitScript(({url})=>{
   const profile={familyMembers:[{name:'父亲测试',relationship:'父亲'},{name:'母亲测试',relationship:'母亲'}],projects:[{name:'科研项目甲'},{name:'科研项目乙'}],publications:[{title:'论文甲'},{title:'论文乙',status:'已录用'}],awards:[{name:'测试奖项甲',awardDate:'2024-12',issuer:'甲单位'},{name:'蓝桥杯省级二等奖',awardDate:'2023-04-23',issuer:'测试单位'}]};
   const data={resumeTemplates:{a:{id:'a',name:'功能测试模板',profile},b:{id:'b',name:'其他模板',profile:{awards:[{name:'另一个模板奖项'}]}}},activeResumeTemplateId:'a',localResumeConfigImported:true,localModelConfigImported:true,aiModels:[],builtinModelOverride:{apiKey:'test-not-real',model:'deepseek-flash'},activeModelId:'builtin-deepseek'};
   const area={get:async keys=>Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,data[k]])),set:async values=>Object.assign(data,values),remove:async keys=>keys.forEach(k=>delete data[k])};
   window.chrome={storage:{local:area,sync:{get:async()=>({}),remove:async()=>{}},onChanged:{addListener(){}}},runtime:{getURL:p=>new URL(p,location.href).href,onMessage:{addListener(){}}},tabs:{query:async()=>[{id:1,url}],sendMessage:(_id,msg,cb)=>{window.__sendToContent(msg).then(cb);}},scripting:{}};
  },{url:base+'/test-awards'});
  await popup.goto(base+'/popup.html');
  await popup.waitForFunction(()=>document.querySelector('#recordSelect').options.length===3);
  assert.equal(await popup.locator('#startRecordFillBtn').isDisabled(),true);
  await popup.selectOption('#recordSelect','1');
  assert.equal(await popup.locator('#startRecordFillBtn').isEnabled(),true);
  await popup.locator('.record-fill-card').screenshot({path:path.join(__dirname,'award-selection-ui.png')});
  async function fillSelected(){
   await popup.click('#startRecordFillBtn');
   await form.locator('#ai-resume-fill-selection-overlay').waitFor();
   const box=await form.locator('#new').boundingBox();
   await form.mouse.move(box.x-2,box.y-2);await form.mouse.down();await form.mouse.move(box.x+box.width+2,box.y+box.height+2,{steps:5});await form.mouse.up();
   await popup.waitForFunction(()=>document.querySelector('#statusText').textContent==='完成');
  }
  await fillSelected();
  assert.equal(await form.inputValue('#newName'),'蓝桥杯省级二等奖');
  assert.equal(await form.inputValue('#newDate'),'2023-04-23');
  assert.equal(await form.inputValue('#newIssuer'),'保留已有单位');
  assert.equal(await form.inputValue('#oldName'),'已填奖项，不应修改');
  assert.ok(await form.evaluate(()=>window.__aiPayloads[0].resumeFields.every(f=>f.path.startsWith('awards.1.'))));
  await form.fill('#newName','');await form.fill('#newDate','');
  await popup.selectOption('#recordSelect','0');await fillSelected();
  assert.equal(await form.inputValue('#newName'),'测试奖项甲');
  assert.equal(await form.evaluate(()=>window.__aiPayloads.length),2);
  for (const [section, expected] of [['familyMembers','母亲测试'],['projects','科研项目乙'],['publications','论文乙']]) {
    await popup.selectOption('#recordSectionSelect',section);
    assert.equal(await popup.inputValue('#recordSelect'),'');
    assert.equal(await popup.locator('#startRecordFillBtn').isDisabled(),true);
    await popup.selectOption('#recordSelect','1');
    await form.fill('#newName','');await form.fill('#newDate','');
    await fillSelected();
    assert.equal(await form.inputValue('#newName'),expected);
    assert.equal(await form.inputValue('#oldName'),'已填奖项，不应修改');
    assert.equal(await form.inputValue('#newIssuer'),'保留已有单位');
    assert.ok(await form.evaluate(section=>window.__aiPayloads.at(-1).resumeFields.every(f=>f.path.startsWith(section+'.1.')),section));
  }
  await popup.locator('.record-fill-card').screenshot({path:path.join(__dirname,'record-selection-ui.png')});
  await popup.selectOption('#recordSectionSelect','certificates');
  assert.equal(await popup.locator('#recordSelect').isDisabled(),true);
  assert.equal(await popup.locator('#startRecordFillBtn').isDisabled(),true);
  await popup.selectOption('#recordSectionSelect','awards');
  await popup.selectOption('#recordSelect','1');
  await popup.selectOption('#fillTemplateSelect','b');
  await popup.waitForFunction(()=>document.querySelector('#recordSelect').options.length===2);
  assert.equal(await popup.inputValue('#recordSelect'),'');
  assert.equal(await popup.locator('#startRecordFillBtn').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('Browser flow passed: dropdown, selection overlay, real field writes, existing values preserved, switching awards, family, projects, publications, empty categories and templates. No API called.');
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
