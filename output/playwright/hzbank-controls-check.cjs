const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../..');
const assets=process.env.HZBANK_ASSET_DIR||path.join(root,'tmp/hzbank-readonly');
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<meta charset="utf-8"><style>body{padding:20px}.el-form-item{margin:20px}.el-input{width:300px}</style><div id="app"></div>');
  await page.addStyleTag({path:path.join(assets,'app.css')});
  for(const file of ['manifest.js','vendor.js'])await page.addScriptTag({path:path.join(assets,file)});
  await page.evaluate(()=>{
   window.webpackJsonp([99],{'control-test-loader':function(m,e,r){window.testRequire=r;}},['control-test-loader']);
   const Vue=testRequire('7+uW').default;Vue.use(testRequire('zL8q'));
   window.testVm=new Vue({el:'#app',data:{sex:'',ethnicity:'',education:'',rank:'',region:[],school:'',chosenSchool:'',disabled:'',other:'',filterable:'',multi:[]},render(h){
    const option=(label,value,disabled=false)=>h('el-option',{props:{label,value,disabled}});
    const select=(key,label,items,props={})=>h('el-form-item',{props:{label},attrs:{id:key}},[h('el-select',{props:{value:this[key],...props},on:{input:v=>this[key]=v}},items.map(([l,v,d])=>option(l,v,d)))]);
    return h('el-form',[
      select('other','其他下拉：',[['女','wrong']]),
      select('sex','性别：',[['男','1'],['女','2']]),
      select('ethnicity','民族：',[['汉族','01'],['回族','03']]),
      select('education','最高学历：',[['硕士研究生','master'],['大学本科','bachelor']]),
      select('rank','成绩排名：',[['前10%','10'],['前20%','20'],['前50%','50']]),
      select('disabled','禁用候选：',[['不应选择','bad',true],['其他','other']]),
      select('filterable','可搜索选择：',[['天津大学','tju'],['大连海事大学','dlmu']],{filterable:true}),
      select('multi','多选保留：',[['甲','a'],['乙','b']],{multiple:true}),
      h('el-form-item',{props:{label:'籍贯：'},attrs:{id:'region'}},[h('el-cascader',{props:{value:this.region,separator:'-',filterable:false,props:{lazy:true,lazyLoad:(node,resolve)=>setTimeout(()=>resolve(node.root?[{value:'37',label:'山东省',leaf:false}]:[{value:'3715',label:'聊城市',leaf:true}]),120)}},on:{input:v=>this.region=v}})]),
      h('el-form-item',{props:{label:'毕业院校：'},attrs:{id:'school'}},[h('el-autocomplete',{props:{value:this.school,triggerOnFocus:false,fetchSuggestions:(query,cb)=>setTimeout(()=>cb(query==='天津大学'?[{value:'天津大学',id:'tju'}]:[]),100)},on:{input:v=>this.school=v,select:item=>this.chosenSchool=item.id}})]),
    ]);
   }});
  });
  await page.addScriptTag({path:path.join(root,'shared/custom-select.js')});
  const fill=(id,value)=>page.evaluate(async({id,value})=>ResumeCustomSelect.fill(document.querySelector('#'+id+' input'),value),{id,value});
  await page.locator('#other input').click();
  assert.equal((await fill('sex','女')).filled,true);
  assert.equal(await page.evaluate(()=>testVm.sex),'2');
  assert.equal(await page.evaluate(()=>testVm.other),'');
  assert.equal((await fill('ethnicity','汉族')).filled,true);
  assert.equal(await page.evaluate(()=>testVm.ethnicity),'01');
  assert.equal((await fill('education','硕士')).filled,true);
  assert.equal(await page.evaluate(()=>testVm.education),'master');
  assert.equal((await fill('rank','28/182')).filled,true);
  assert.equal(await page.evaluate(()=>testVm.rank),'20');
  const regionResult=await fill('region','山东省/聊城市/高唐县');
  assert.equal(regionResult.filled,true,JSON.stringify(regionResult));
  assert.deepEqual(await page.evaluate(()=>testVm.region),['37','3715']);
  const schoolResult=await fill('school','天津大学');
  assert.equal(schoolResult.filled,true,JSON.stringify(schoolResult));
  assert.equal(await page.evaluate(()=>testVm.chosenSchool),'tju');
  assert.equal((await fill('filterable','大连海事大学')).filled,true);
  assert.equal(await page.evaluate(()=>testVm.filterable),'dlmu');
  assert.equal((await fill('disabled','不应选择')).filled,false);
  assert.equal(await page.evaluate(()=>testVm.disabled),'');
  assert.equal((await fill('multi','甲')).filled,false);
  assert.deepEqual(await page.evaluate(()=>testVm.multi),[]);
  // Exercise actual scanning, model mapping (stubbed), and deterministic fill together.
  await page.evaluate(()=>{
    testVm.sex='';testVm.ethnicity='';testVm.education='';testVm.rank='';testVm.region=[];testVm.school='';testVm.chosenSchool='';
    window.contentListeners=[];window.mappingPayloads=[];const local={};
    window.chrome={runtime:{onMessage:{addListener:fn=>contentListeners.push(fn)},sendMessage:(msg,callback)=>{
      let response={success:true};
      if(msg.action==='callAI') {
        const payload=JSON.parse(msg.prompt);mappingPayloads.push(payload);
        const rules=[['性别','personal.gender'],['民族','personal.ethnicity'],['最高学历','personal.highestEducationLevel'],['成绩排名','educations.0.ranking'],['籍贯','contactAndLocation.hometownCity'],['毕业院校','educations.0.school']];
        response.data=JSON.stringify({mappings:payload.fields.map(field=>({fieldId:field.fieldId,resumePath:rules.find(([label])=>field.label.includes(label))?.[1]||''}))});
      }
      callback?.(response);return Promise.resolve(response);
    }},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in local).map(k=>[k,local[k]])),set:async values=>Object.assign(local,values)}}};
  });
  for(const file of ['shared/resume-schema.js','shared/diagnostics.js','shared/field-text.js','shared/field-semantics.js','shared/fill-runtime.js','shared/content-bridge.js','shared/ai-client.js','content.js']) await page.addScriptTag({path:path.join(root,file)});
  const result=await page.evaluate(()=>new Promise(resolve=>contentListeners[0]({action:'startFill',modelId:'test',fillMode:'overwrite',scope:'page',resumeProfile:ResumeSchema.normalizeResumeProfile({personal:{gender:'女',ethnicity:'汉族',highestEducationLevel:'硕士'},educations:[{school:'天津大学',ranking:'28/182'}],contactAndLocation:{hometownProvince:'山东省',hometownCity:'聊城市',hometownDistrict:'高唐县'}})},{},resolve)));
  assert.equal(result.success,true,JSON.stringify(result));
  if (result.filledCount !== 6) console.log(await page.evaluate(()=>mappingPayloads[0].fields.map(f=>({label:f.label,id:f.id,kind:f.kind,nearby:f.nearbyLabels,context:f.context}))));
  assert.equal(result.filledCount,6,JSON.stringify(result));
  assert.deepEqual(await page.evaluate(()=>[testVm.sex,testVm.ethnicity,testVm.education,testVm.rank,testVm.region,testVm.chosenSchool]),['2','01','master','20',['37','3715'],'tju']);
  assert.ok(await page.evaluate(()=>mappingPayloads[0].fields.filter(f=>['性别','民族','最高学历','成绩排名','籍贯','毕业院校'].some(label=>f.label.includes(label))).every(f=>f.kind==='select')));
  await page.screenshot({path:path.join(__dirname,'hzbank-controls.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Real site libraries passed: Element UI 2.15.14 / Vue 2.7.16; ordinary/filterable selects, aliases, rank bands, lazy 2-level cascader, school suggestion select event, disabled/multi guards and popup isolation. No bank account/API used.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
