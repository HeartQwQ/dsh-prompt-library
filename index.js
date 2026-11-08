import {readFileSync} from 'node:fs';
import {createService,publicError} from './service.mjs';
import {validateCatalog} from './shared.mjs';
export const inject=['llm','webServer','tools','sessions'];
export function apply(ctx,config={}){
 const read=name=>JSON.parse(readFileSync(new URL('./data/'+name,import.meta.url),'utf8'));
 const catalog=validateCatalog(read('catalog.json'),read('sources.json').sources,read('skills.json').skills);
 const editor=ctx.get('configEditor'),entry=ctx.fiber?.entry;
 const service=createService({llm:ctx.llm,catalog,sessions:ctx.sessions,initialPreference:config.polishPreference,savePreference:editor&&entry!==undefined?p=>editor.edit(entry,current=>({...current,polishPreference:p})):undefined});
 ctx.effect(()=>()=>service.dispose());
 ctx.effect(()=>ctx.tools.register({name:'prompt_library',description:'List optimization models, read/save the optimization model, optimize supplied draft text, or cancel a request. Does not send a message or modify the composer.',parameters:{action:{type:'string',required:true,enum:['models','preferences','savePreferences','optimize','cancel']},draft:{type:'string'},sessionId:{type:'string'},requestId:{type:'string'},currentModel:{type:'object',additionalProperties:true},preference:{type:'object',additionalProperties:true},referenceIds:{type:'array',items:{type:'string'}},includeHistory:{type:'boolean'}},output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:args=>['models','preferences'].includes(args?.action),async execute(args,exec){try{return {ok:true,value:await service.dispatch(args,{signal:exec?.signal})};}catch(error){return {ok:false,error:publicError(error)};}}}));
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/plugins/dsh-prompt-library/api',async handler(req,res){
  const abort=new AbortController();const cancel=()=>abort.abort();req.once('aborted',cancel);res.once('close',cancel);let streaming=false;
  const json=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const address=req.socket?.remoteAddress??'',host=req.headers.host;
   if(!/^(?:::ffff:)?127\./.test(address)&&address!=='::1')return json(403,{ok:false,error:{message:'仅允许本地请求'}});
   if(!host||!['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+host).hostname)||req.headers.origin&&new URL(req.headers.origin).host!==host)return json(403,{ok:false,error:{message:'请求来源不符'}});
   if(req.method!=='POST'||req.headers['x-dsh-prompt-library']!=='1'||!/^application\/json\b/.test(req.headers['content-type']??''))return json(403,{ok:false,error:{message:'请求格式不符'}});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>196608)return json(413,{ok:false,error:{message:'请求过大'}});chunks.push(Buffer.from(chunk));}const body=Buffer.concat(chunks).toString('utf8');
   let args;try{args=JSON.parse(body);}catch{return json(400,{ok:false,error:{message:'无效JSON'}});}
   if(args.action==='optimize'){
    streaming=true;res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    await service.dispatch(args,{signal:abort.signal,onEvent:event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');}});res.end();
   }else json(200,{ok:true,value:await service.dispatch(args,{signal:abort.signal})});
  }catch(error){if(!res.destroyed){if(streaming){res.end(JSON.stringify({type:'error',error:publicError(error)})+'\n');}else json(400,{ok:false,error:publicError(error)});}}
  finally{req.off('aborted',cancel);res.off('close',cancel);}
 }}));
}
