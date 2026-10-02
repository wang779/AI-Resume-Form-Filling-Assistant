const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared/custom-select.js'),'utf8'),context);
const helper=context.ResumeCustomSelect;
function option(text,{disabled=false}={}) {return {textContent:text,querySelector:()=>null,getAttribute:()=>null,classList:{contains:name=>name==='is-disabled'&&disabled}};}
test('custom dropdown uses exact or explicit equivalent labels and rejects ambiguous/disabled matches',()=>{
 const master=option('硕士研究生'),bachelor=option('大学本科');
 assert.equal(helper.chooseOption([master,bachelor],'硕士'),master);
 assert.equal(helper.chooseOption([option('其他硕士课程')],'硕士'),null);
 assert.equal(helper.chooseOption([master,option('硕士研究生')],'硕士'),null);
 assert.equal(helper.chooseOption([option('女',{disabled:true})],'女'),null);
});
test('ranking fractions choose the narrowest qualifying percentage bucket',()=>{
 const top10=option('前10%'),top20=option('前20%'),top50=option('前50%');
 assert.equal(helper.chooseOption([top50,top10,top20],'28/182'),top20);
 assert.equal(helper.chooseOption([top50,top10,top20],'2/103'),top10);
 assert.equal(helper.chooseOption([top50,top10,top20],'190/182'),null);
});
test('cascader consumes geographic prefixes without matching unrelated locations',()=>{
 assert.equal(helper.splitTail('山东省/聊城市/高唐县','山东省'),'聊城市高唐县');
 assert.equal(helper.splitTail('山东省-聊城市','山东'),'聊城市');
 assert.equal(helper.splitTail('河北省/保定市','山东省'),null);
});
test('combined hometown cascader receives the full available address while plain city stays unchanged',()=>{
 const profile={contactAndLocation:{hometownProvince:'山东省',hometownCity:'聊城市',hometownDistrict:'高唐县'}};
 assert.equal(helper.resolveValue({controlType:'cascader'},'聊城市',profile,'contactAndLocation.hometownCity'),'山东省/聊城市/高唐县');
 assert.equal(helper.resolveValue({controlType:'select'},'聊城市',profile,'contactAndLocation.hometownCity'),'聊城市');
});
