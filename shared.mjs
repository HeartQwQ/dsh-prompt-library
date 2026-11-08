/** Pure catalogue, retrieval and draft guards; shared by Host, Client and tests. */
export function validateCatalog(catalog,sources,skills){
 if(catalog.schemaVersion!==2||!Array.isArray(catalog.prompts))throw Error('不支持的数据格式');
 const ids=new Set(),categories=new Set(catalog.categories.map(x=>x.id)),sourceIds=new Set(sources.map(x=>x.id)),skillIds=new Set(skills.map(x=>x.id));
 for(const source of sources)if(new URL(source.url).protocol!=='https:')throw Error('来源必须是HTTPS链接');
 for(const p of catalog.prompts){
  if(!p.id||ids.has(p.id)||!categories.has(p.category))throw Error('重复ID或无效分类');ids.add(p.id);
  if(!p.title||!p.purpose||!p.body||!p.acceptance?.length||!p.exampleInput||!p.sourceIds?.length)throw Error('模板缺少必要内容');
  if(!p.sourceIds.every(x=>sourceIds.has(x))||!p.skillIds.every(x=>skillIds.has(x)))throw Error('无效来源或Skill引用');
  const variables=[...new Set([...p.body.matchAll(/\{\{([^{}]+)\}\}/g)].map(x=>x[1]))];
  if(variables.some(x=>!p.variables.some(v=>v.name===x))||p.variables.some(v=>!variables.includes(v.name)||!p.exampleInput[v.name]))throw Error('变量或示例不完整');
  if(!['editor-reviewed','pending'].includes(p.quality.review)||p.quality.modelTest!=='not-run')throw Error('未提供模型实测证据');
 }
 return catalog;
}
export function fillTemplate(prompt,values={}){
 const missing=prompt.variables.filter(v=>v.required&&!(typeof values[v.name]==='string'&&values[v.name].trim())).map(v=>v.name);
 return {missing,text:prompt.body.replace(/\{\{([^{}]+)\}\}/g,(token,name)=>values[name]?.trim()?values[name]:token)};
}
export function tokens(text){
 const norm=String(text).toLowerCase();const result=norm.match(/[a-z][a-z0-9_-]{1,}/g)??[];
 for(const part of norm.match(/[\u4e00-\u9fff]+/g)??[])for(let i=0;i<part.length-1;i++)result.push(part.slice(i,i+2));
 return new Set(result);
}
export function retrieve(prompts,draft,selected=[]){
 if(!Array.isArray(selected)||selected.length>3||selected.some(id=>!prompts.some(p=>p.id===id)))throw Error('最多选择3条有效参考');
 if(selected.length)return [...new Set(selected)].map(id=>prompts.find(p=>p.id===id));
 const query=tokens(draft);
 return prompts.map(p=>{const title=tokens(p.title+' '+p.tags.join(' ')),purpose=tokens(p.purpose);let score=0;for(const t of query)score+=title.has(t)?3:purpose.has(t)?1:0;return {p,score};}).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id)).slice(0,3).map(x=>x.p);
}
export function draftSnapshot(binding){return {sessionId:binding.sessionId,text:binding.input.draft,revision:binding.input.draftRev};}
export function draftMatches(binding,snapshot){return Boolean(binding?.mounted&&binding.sessionId===snapshot?.sessionId&&binding.input?.draft===snapshot.text&&binding.input?.draftRev===snapshot.revision&&binding.input.phase==='plain');}
export function replaceDraft(binding,snapshot,text){
 if(!draftMatches(binding,snapshot))throw Error('会话或草稿已变化，请复制结果或基于新草稿重新优化');
 if(binding.input.occurrences?.length)throw Error('草稿包含结构化引用，请复制结果，避免破坏引用');
 const anchor=binding.actions.captureInsertion();
 if(anchor.draftRev!==snapshot.revision||!binding.actions.insertText(text,{...anchor,start:0,end:snapshot.text.length}))throw Error('输入框拒绝写入，原草稿已保留');
 binding.actions.persistDraft?.();return true;
}
export function normalizePreference(value){
 if(!value||value.mode==='follow')return {mode:'follow'};
 if(value.mode!=='fixed'||typeof value.provider!=='string'||!value.provider||typeof value.model!=='string'||!value.model)throw Error('请选择有效的渠道与模型');
 return {mode:'fixed',provider:value.provider,model:value.model};
}
export function publicError(error){
 const code=String(error?.code??'REQUEST_FAILED');
 const labels={AUTH:'模型鉴权失败，请到DSH模型设置检查',INVALID_CREDENTIAL:'模型鉴权失败，请到DSH模型设置检查',QUOTA_EXCEEDED:'模型额度不足',RATE_LIMIT:'模型请求受限，请稍后手动重试',CONTEXT_WINDOW_EXCEEDED:'输入超出模型容量，请减少草稿或上下文',NO_ADAPTER:'所选模型渠道不可用',ABORT_ERR:'已取消'};
 return {code,message:labels[code]??(error?.safe?error.message:'请求失败，请检查模型配置或稍后重试。原草稿已保留。')};
}
