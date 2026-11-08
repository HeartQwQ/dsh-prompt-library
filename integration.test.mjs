import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {apply} from './index.js';
const callbacks=[],tools=[],routes=[];
const ctx={llm:{listProviders:()=>[{id:'fake',name:'Test model'}],listModels:async()=>[{id:'test',provider:'fake',name:'Test'}],async prepareCall(route,signal,configure){const config=configure({}, {defaultMaxTokens:1024,context:{contextWindow:64000}});return {config:{...route,...config},async *stream(options){assert.equal(options.tools.length,0);yield {type:'text-delta',text:'请检查所附日志，列出证据与最小验证步骤。'};yield {type:'finish',reason:{kind:'stop'}};}};}},sessions:{get:()=>null},get:()=>({edit:async(_entry,update)=>update({})}),fiber:{entry:'test'},effect(fn){const result=fn();if(typeof result==='function')callbacks.push(result);},tools:{register(tool){tools.push(tool);return()=>{};}},webServer:{register(route){routes.push(route);return()=>{};}}};
apply(ctx);
test('HTTP UI and Agent callers share the same Host preference and optimize service',async()=>{
 const server=createServer(routes[0].handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const address='http://127.0.0.1:'+server.address().port+'/plugins/dsh-prompt-library/api';
 const post=(args,headers={})=>fetch(address,{method:'POST',headers:{'content-type':'application/json','x-dsh-prompt-library':'1',...headers},body:JSON.stringify(args)});
 try{
  const tool=tools[0];assert.equal(tool.name,'prompt_library');
  const result=await tool.execute({action:'savePreferences',preference:{mode:'fixed',provider:'fake',model:'test'}});assert.equal(result.ok,true);
  const pref=await(await post({action:'preferences'})).json();assert.equal(pref.value.model,'test');
  const response=await post({action:'optimize',sessionId:'test-session',draft:'帮我排查错误'});assert.match(response.headers.get('content-type'),/x-ndjson/);
  const events=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(events[0].type,'meta');assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).result.model.provider,'fake');assert.ok(events.at(-1).result.text.includes('日志'));
  const agent=await tool.execute({action:'optimize',sessionId:'test-session',draft:'帮我排查错误'});assert.equal(agent.ok,true);assert.equal(agent.value.text,events.at(-1).result.text);
  const foreign=await post({action:'models'},{origin:'http://evil.example'});assert.equal(foreign.status,403);
  const noHeader=await fetch(address,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(noHeader.status,403);
  const malformed=await fetch(address,{method:'POST',headers:{'content-type':'application/json','x-dsh-prompt-library':'1'},body:'{'});assert.equal(malformed.status,400);
  const errorEvents=(await(await post({action:'optimize',sessionId:'test-session',draft:''})).text()).trim().split('\n').map(JSON.parse);assert.equal(errorEvents[0].type,'error');assert.equal(errorEvents.some(e=>e.type==='done'),false);
 }finally{await new Promise(r=>server.close(r));for(const stop of callbacks)stop();}
});
test('built Client registers independent library, composer shortcut and overlay through native Slots',()=>{
 let plugin;const registrations=[];
 const sandbox={window:{__ModuleLoader__:{load(module){plugin=module.factory(name=>{assert.equal(name,'react');return {createElement:()=>null,useState:()=>{},useEffect:()=>{},useRef:()=>{}};});}}},localStorage:{getItem:()=>null},console};
 vm.runInNewContext(readFileSync(new URL('./client.js',import.meta.url),'utf8'),sandbox);
 plugin.apply({slots:{inject(_name,callback){callback();},register(options){registrations.push(options);return()=>{};}},locale:{register:()=>()=>{},bind:()=>key=>key},layout:{},effect(fn){fn();}});
 assert.ok(registrations.some(x=>x.name==='main'&&x.key==='prompt-library'));
 assert.ok(registrations.some(x=>x.name==='sidebar.panellist'&&x.id==='prompt-library'));
 assert.ok(registrations.some(x=>x.name==='conversation.input.dock'));
 assert.ok(registrations.some(x=>x.name==='shell.overlay'));
 assert.equal(registrations.filter(x=>x.name==='conversation.input.right').length,0);
});
