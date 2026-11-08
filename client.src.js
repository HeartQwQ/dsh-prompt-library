window.__ModuleLoader__.load({id:'dsh-prompt-library',factory(require){
 const React=require('react'),h=React.createElement,{useState,useEffect,useRef}=React;
 /*__SHARED__*/
 const DATA=/*__DATA__*/;
 const CSS=/*__CSS__*/;
 const NS='dsh-prompt-library',KEY=NS+':prefs';let ctx;
 const readPrefs=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')??{};}catch{return {};}};
 const old=readPrefs(),validIds=new Set(DATA.prompts.map(p=>p.id));
 let state={category:DATA.categories.some(c=>c.id===old.category)?old.category:'all',query:'',filter:'all',selected:validIds.has(old.lastPromptId)?old.lastPromptId:DATA.prompts[0]?.id,favorites:Array.isArray(old.favorites)?old.favorites.filter(x=>validIds.has(x)):[],recent:Array.isArray(old.recent)?old.recent.filter(x=>validIds.has(x)):[],currentSession:null,quick:null,notice:'',error:'',preference:{mode:'follow'},groups:[],configured:false,loading:false,job:null,undo:null,pending:null};
 const listeners=new Set(),bindings=new Map();
 function update(patch){state={...state,...patch};for(const fn of listeners)fn(state);}
 function persist(patch){try{const next={...readPrefs(),...patch};localStorage.setItem(KEY,JSON.stringify(next));return true;}catch{update({error:'无法保存本地偏好，本次操作只在当前窗口有效'});return false;}}
 function useStore(){const [value,set]=useState(state);useEffect(()=>{listeners.add(set);set(state);return()=>listeners.delete(set);},[]);return value;}
 const notice=text=>update({notice:text,error:''});
 function touch(id){const recent=[id,...state.recent.filter(x=>x!==id)].slice(0,20);update({recent});persist({recent,lastPromptId:id});}
 function star(id){const favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];update({favorites});persist({favorites});}
 async function api(args,signal){const response=await fetch('/plugins/dsh-prompt-library/api',{method:'POST',headers:{'content-type':'application/json','x-dsh-prompt-library':'1'},body:JSON.stringify(args),signal});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error?.message||'宿主请求失败');return result.value;}
 async function loadConfig(){update({loading:true});try{const [preference,groups]=await Promise.all([api({action:'preferences'}),api({action:'models'})]);update({preference,groups,configured:true,loading:false});}catch(error){update({error:error.message,loading:false,configured:false});}}
 async function copy(text){try{await navigator.clipboard.writeText(text);notice('已复制');return true;}catch{update({error:'复制失败，请在预览中选择文本手动复制'});return false;}}
 function openQuick(mode,sessionId){update({quick:{mode,sessionId},error:'',notice:''});}
 function closeQuick(){update({quick:null});}
 function insert(binding,prompt,text,snapshot){
  if(!draftMatches(binding,snapshot))throw Error('目标会话或草稿已变化，请重新选择或复制');
  const anchor=binding.actions.captureInsertion();
  if(anchor.draftRev!==snapshot.revision||!binding.actions.insertText(text,anchor))throw Error('输入框拒绝插入，请复制模板');
  binding.actions.persistDraft?.();touch(prompt.id);notice('已插入目标会话，未发送');
 }
 function useTemplate(prompt,text,target){
  try{const binding=bindings.get(target);if(!binding)throw Error('请先打开一个对话，或复制模板使用');const snapshot=draftSnapshot(binding);
   if(binding.mounted){insert(binding,prompt,text,snapshot);}
   else{if(target!==state.currentSession)throw Error('请先在DSH切换到目标会话');update({pending:{target,promptId:prompt.id,text,snapshot}});ctx.layout.selectPanel(null);notice('正在返回目标会话；会再次校验草稿后插入');}
  }catch(error){update({error:error.message});}
 }
 async function optimize(binding,referenceIds,includeHistory){
  let requestId;
  if(state.job?.status==='running')return;
  try{
   if(!binding?.mounted)throw Error('请回到当前对话使用优化提示词');
   if(!binding.input.draft.trim())throw Error('请输入要优化的提示词');
   if(binding.input.phase!=='plain')throw Error('当前输入框处于命令或提交状态，请稍后再试');
   const snapshot=draftSnapshot(binding),id=crypto.randomUUID(),controller=new AbortController();requestId=id;
   update({job:{id,snapshot,controller,status:'running',stream:'',result:null,model:state.preference.mode==='fixed'?state.preference:binding.model,references:[]},undo:null,error:'',notice:''});
   const response=await fetch('/plugins/dsh-prompt-library/api',{method:'POST',headers:{'content-type':'application/json','x-dsh-prompt-library':'1'},body:JSON.stringify({action:'optimize',requestId:id,sessionId:snapshot.sessionId,draft:snapshot.text,currentModel:binding.model,referenceIds,includeHistory}),signal:controller.signal});
   if(!response.ok||!response.body)throw Error('优化服务不可用，原草稿已保留');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',terminal=false;
   const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(state.job?.id!==id)return;if(event.type==='error')throw Error(event.error?.message||'优化失败');if(event.type==='meta')update({job:{...state.job,model:event.model,references:event.references,generic:event.generic}});if(event.type==='text')update({job:{...state.job,stream:state.job.stream+event.text}});if(event.type==='done'){terminal=true;update({job:{...state.job,status:'completed',result:event.result}});}};
   try{for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);consume(line);}}buffer+=decoder.decode();if(buffer.trim())consume(buffer);if(!terminal)throw Error('连接提前结束，结果未完成，原草稿已保留');}
   finally{reader.releaseLock();}
  }catch(error){if(requestId&&state.job?.id!==requestId)return;if(state.job?.status==='running')update({job:{...state.job,status:'failed'},error:error.name==='AbortError'?'已取消，原草稿已保留':error.message});else update({error:error.message});}
 }
 function cancel(){const job=state.job;if(job?.status!=='running')return;job.controller.abort();api({action:'cancel',sessionId:job.snapshot.sessionId,requestId:job.id}).catch(()=>{});update({job:{...job,status:'cancelled'},notice:'已取消，原草稿已保留'});}
 function applyResult(){const job=state.job;if(job?.status!=='completed')return;try{const binding=bindings.get(job.snapshot.sessionId);replaceDraft(binding,job.snapshot,job.result.text);update({undo:{sessionId:job.snapshot.sessionId,before:job.snapshot.text,applied:job.result.text},notice:'已应用，未发送。可撤销。',error:''});}catch(error){update({error:error.message});}}
 function undo(){try{const saved=state.undo,binding=bindings.get(saved?.sessionId);if(!saved||!binding?.mounted||binding.input.draft!==saved.applied)throw Error('草稿已变化，不能自动撤销；原稿仍可从结果对照中复制');replaceDraft(binding,draftSnapshot(binding),saved.before);update({undo:null,notice:'已恢复原稿',error:''});}catch(error){update({error:error.message});}}
 const Style=()=>h('style',null,CSS);
 const button=(label,onClick,extra={})=>h('button',{type:'button',onClick,...extra},label);
 function Status(){const s=useStore();return h('div',{'aria-live':'polite',className:'dpl-status'},s.error?h('p',{role:'alert',className:'dpl-error'},s.error):s.notice?h('p',null,s.notice):null);}
 function Sources({prompt}){return h('details',null,h('summary',null,'来源与推荐 Skill'),h('p',null,prompt.provenance.note),prompt.sourceIds.map(id=>{const source=DATA.sources.find(x=>x.id===id);return h('p',{key:id},h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.name),' · '+source.license+' · '+source.checkedAt);}),h('ul',null,prompt.ideas.map((idea,i)=>h('li',{key:i},idea))),prompt.skillIds.map(id=>{const skill=DATA.skills.find(x=>x.id===id);return h('div',{key:id},h('strong',null,skill.name),h('p',null,skill.when+'。'+skill.dependencies+'。未检测安装，不自动调用。'));}));}
 function Detail({prompt,target}){
  const [values,setValues]=useState({});useEffect(()=>setValues({}),[prompt.id]);const filled=fillTemplate(prompt,values);
  return h('section',{className:'dpl-detail','aria-label':'提示词详情'},h('header',null,h('span',{className:'dpl-badge'},'已审校 · 未模型实测'),h('h2',null,prompt.title),h('p',null,prompt.purpose)),
   h('div',{className:'dpl-fields'},prompt.variables.map(v=>h('label',{key:v.name},v.name+' *',h('textarea',{value:values[v.name]??'',rows:2,onChange:e=>setValues({...values,[v.name]:e.target.value}),placeholder:'填写'+v.name,'aria-label':v.name})))),
   h('div',{className:'dpl-actions'},button('填入示例',()=>setValues(prompt.exampleInput)),button('复制原始模板',()=>copy(prompt.body))),
   h('label',null,'最终预览',h('textarea',{className:'dpl-preview',readOnly:true,value:filled.text,rows:12,'aria-label':'最终提示词预览'})),
   filled.missing.length?h('p',{className:'dpl-muted'},'待填写：'+filled.missing.join('、')):null,
   h('div',{className:'dpl-actions'},button('复制',()=>copy(filled.text),{disabled:!!filled.missing.length}),button('插入目标会话',()=>useTemplate(prompt,filled.text,target),{disabled:!!filled.missing.length||!target,className:'dpl-primary'})),
   h('details',null,h('summary',null,'使用示例与验收（示例为虚构数据）'),h('pre',null,JSON.stringify(prompt.exampleInput,null,2)),h('ul',null,prompt.acceptance.map((a,i)=>h('li',{key:i},a)))),h(Sources,{prompt}));
 }
 function ModelSettings(){const s=useStore();const [saving,setSaving]=useState(false);useEffect(()=>{if(!state.configured&&!state.loading)loadConfig();},[]);
  const value=s.preference.mode==='follow'?'follow':JSON.stringify([s.preference.provider,s.preference.model]);
  async function select(raw){setSaving(true);try{const preference=raw==='follow'?{mode:'follow'}:{mode:'fixed',provider:JSON.parse(raw)[0],model:JSON.parse(raw)[1]};const stored=await api({action:'savePreferences',preference});update({preference:stored,error:'',notice:'润色模型已保存，聊天模型保持不变'});}catch(error){update({error:error.message});}finally{setSaving(false);}}
  return h('div',{className:'dpl-model'},h('label',null,'润色模型',h('select',{value,onChange:e=>select(e.target.value),disabled:saving||s.loading||!s.configured,'aria-label':'润色模型'},h('option',{value:'follow'},'跟随当前会话模型'),s.groups.map(group=>h('optgroup',{key:group.provider,label:group.name||group.provider},group.models.map(m=>h('option',{key:m.id,value:JSON.stringify([group.provider,m.id])},m.name)))))),button(s.loading?'读取中…':'刷新模型',loadConfig,{disabled:s.loading}),s.groups.filter(g=>g.error).map(g=>h('p',{className:'dpl-error',key:g.provider},g.provider+'：'+g.error)),!s.configured?h('p',null,'读取模型配置后才能开始优化。'):null);
 }
 function Optimizer({target}){
  const s=useStore(),[includeHistory,setHistory]=useState(false),[refs,setRefs]=useState([]);const binding=bindings.get(target),job=s.job,route=s.preference.mode==='fixed'?s.preference:binding?.model;const completed=job?.status==='completed';
  const current=completed&&draftMatches(bindings.get(job.snapshot.sessionId),job.snapshot)&&job.snapshot.sessionId===target;
  return h('section',{className:'dpl-optimizer'},h('h2',null,'优化提示词'),h('p',null,'保留原意，整理任务、输入与输出要求；只生成指令，不执行任务。'),h(ModelSettings),h('p',{className:'dpl-muted'},'本次模型：'+(route?route.provider+' / '+route.model:'尚未选择')+' · 点击开始将消耗该模型额度'),
   h('label',null,h('input',{type:'checkbox',checked:includeHistory,onChange:e=>setHistory(e.target.checked)}),' 结合当前会话最近6条用户/助手文本（不含附件及工具日志）'),
   h('details',null,h('summary',null,'指定参考（最多3条，留空自动检索）'),h('select',{multiple:true,value:refs,size:5,'aria-label':'指定参考提示词',onChange:e=>{const next=[...e.target.selectedOptions].map(o=>o.value);if(next.length>3)update({error:'最多选择3条参考'});else setRefs(next);}},DATA.prompts.map(p=>h('option',{key:p.id,value:p.id},p.title)))),
   h('div',{className:'dpl-actions'},button(job?.status==='running'?'正在优化…':'开始优化',()=>optimize(binding,refs,includeHistory),{className:'dpl-primary',disabled:job?.status==='running'||!s.configured||!binding?.mounted}),job?.status==='running'?button('取消',cancel):null),
   !binding?.mounted?h('p',null,'请返回目标对话后使用输入框的优化入口。'):null,
   job?h('div',{className:'dpl-result'},h('p',null,'实际模型：'+(job.model?job.model.provider+' / '+job.model.model:'准备中')),h('p',{className:'dpl-muted'},job.generic?'使用通用优化规则':(job.references?.map(r=>r.title).join('、')||'检索参考中…')),h('details',null,h('summary',null,'原稿'),h('pre',null,job.snapshot.text)),h('textarea',{readOnly:true,rows:12,value:job.result?.text??job.stream,'aria-label':'优化结果'}),job.result?.changes?h('p',null,job.result.changes):null,h('div',{className:'dpl-actions'},button('应用到输入框',applyResult,{disabled:!current}),button('复制结果',()=>copy(job.result.text),{disabled:!completed}),s.undo?button('撤销应用',undo):null),completed&&!current?h('p',{className:'dpl-error'},'目标或草稿已变化，不能应用；可复制或重新优化。'):null):null);
 }
 function Library({compact=false,target}){
  const s=useStore(),query=s.query.trim().toLowerCase();let prompts=DATA.prompts.filter(p=>(s.category==='all'||p.category===s.category)&&(!query||[p.title,p.purpose,...p.tags,p.body].join(' ').toLowerCase().includes(query))&&(s.filter==='all'||(s.filter==='favorites'?s.favorites:s.recent).includes(p.id)));
  if(s.filter==='recent')prompts.sort((a,b)=>s.recent.indexOf(a.id)-s.recent.indexOf(b.id));const selected=prompts.find(p=>p.id===s.selected)??prompts[0];
  return h('div',{className:'dpl-library'+(compact?' dpl-compact':'')},h('header',{className:'dpl-header'},h('div',null,h('h1',null,'提示词库'),h('p',null,DATA.prompts.length+' 个任务模板 · 输入清楚，结果可检查')),h('div',{className:'dpl-actions'},button('优化提示词',()=>openQuick('optimize',target)),button('润色模型',()=>openQuick('settings',target)))),
   h('div',{className:'dpl-toolbar'},h('input',{type:'search',placeholder:'搜索任务、方法或关键词…',value:s.query,'aria-label':'搜索提示词',onChange:e=>update({query:e.target.value})}),h('select',{value:s.filter,'aria-label':'提示词范围',onChange:e=>update({filter:e.target.value})},h('option',{value:'all'},'全部'),h('option',{value:'favorites'},'收藏'),h('option',{value:'recent'},'最近使用'))),
   h('p',{className:'dpl-target'},'插入目标：'+(target?'当前对话 '+target.slice(0,10)+'（保留草稿，未自动发送）':'未绑定对话，可复制使用')),
   h('div',{className:'dpl-columns'},h('nav',{'aria-label':'任务分类',className:'dpl-nav'},[{id:'all',label:'全部任务'},...DATA.categories].map(c=>button(c.label,()=>{update({category:c.id});persist({category:c.id});},{key:c.id,'aria-pressed':s.category===c.id}))),
    h('div',{className:'dpl-list','aria-label':'提示词列表'},h('p',{className:'dpl-muted'},prompts.length+' 个结果'),prompts.map(p=>h('div',{key:p.id,className:'dpl-row','data-selected':selected?.id===p.id},button(h(React.Fragment,null,h('strong',null,p.title),h('small',null,p.purpose)),()=>update({selected:p.id}),{'aria-pressed':selected?.id===p.id}),button(s.favorites.includes(p.id)?'★':'☆',()=>star(p.id),{'aria-label':(s.favorites.includes(p.id)?'取消收藏':'收藏')+p.title}))),!prompts.length?h('p',null,'没有匹配的模板，请调整搜索或分类。'):null),selected?h(Detail,{key:selected.id,prompt:selected,target}):h('section',{className:'dpl-detail'},'选择一个任务开始')),
   h(Status));
 }
 function Page(){const s=useStore();return h('div',{className:'dpl-root'},h(Style),h(Library,{target:s.currentSession}));}
 function Dock(props){
  const input=props.useInput(x=>x),selection=props.useProjection('modelSelection'),bindingRef=useRef({mounted:false});const s=useStore();
  const binding=bindingRef.current;binding.sessionId=props.sessionId;binding.input=input;binding.model=selection?.next??selection?.lastUsed;binding.actions=props.inputActions;
  useEffect(()=>{binding.mounted=true;bindings.set(props.sessionId,binding);update({currentSession:props.sessionId});return()=>{binding.mounted=false;update({});};},[props.sessionId]);
  useEffect(()=>{update({});const pending=state.pending;if(pending&&pending.target===props.sessionId){update({pending:null});try{insert(binding,DATA.prompts.find(p=>p.id===pending.promptId),pending.text,pending.snapshot);}catch(error){update({error:error.message});}}},[props.sessionId,input.draftRev,input.phase]);
  return h('div',{className:'dpl-root dpl-dock'},h(Style),button('提示词库',()=>openQuick('library',props.sessionId)),h('span',null,!s.configured?'润色模型：待读取':s.preference.mode==='fixed'?s.preference.provider+' / '+s.preference.model:'润色：'+(binding.model?binding.model.provider+' / '+binding.model.model:'当前会话未选模型')),button(s.job?.status==='running'?'优化中…':'优化提示词',()=>{openQuick('optimize',props.sessionId);if(state.configured)optimize(binding,[],false);},{className:'dpl-primary',title:'按所选模型计费；只优化当前草稿'}),button('打开独立库',()=>ctx.layout.selectPanel('prompt-library')));
 }
 function Overlay(){const s=useStore(),panel=useRef(null),previous=useRef(null);useEffect(()=>{if(!s.quick)return;previous.current=document.activeElement;panel.current?.querySelector('button')?.focus();return()=>{if(previous.current?.isConnected)previous.current.focus();};},[!!s.quick]);
  if(!s.quick)return null;
  function keydown(e){if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeQuick();}if(e.key==='Tab'){const nodes=[...panel.current.querySelectorAll('button,input,select,textarea,a,summary')].filter(el=>!el.disabled&&el.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  return h('div',{className:'dpl-root dpl-mask'},h(Style),h('div',{className:'dpl-modal',ref:panel,role:'dialog','aria-modal':true,'aria-label':s.quick.mode==='library'?'选择提示词':'优化提示词',onKeyDown:keydown},h('div',{className:'dpl-modalbar'},h('strong',null,s.quick.mode==='library'?'选择任务模板':s.quick.mode==='settings'?'润色模型设置':'优化当前草稿'),button('关闭',closeQuick)),s.quick.mode==='library'?h(Library,{compact:true,target:s.quick.sessionId}):s.quick.mode==='settings'?h(React.Fragment,null,h(ModelSettings),h(Status)):h(React.Fragment,null,h(Optimizer,{target:s.quick.sessionId}),h(Status))));
 }
 return {inject:['slots','locale','layout'],apply(context){ctx=context;const dict={meta:{title:'提示词库',description:'精选任务模板、Skill方法与AI提示词优化'},library:'提示词库'};ctx.effect(()=>ctx.locale.register(NS,'zh',dict));ctx.effect(()=>ctx.locale.register(NS,'en',{meta:{title:'Prompt library',description:'Curated task prompts and AI prompt optimization'},library:'Prompt library'}));
  const Entry=()=>h('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M5 3h14v18l-7-4-7 4z'}));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'prompt-library',order:-8,locale:NS,label:()=>ctx.locale.bind(NS)('library')},Entry));
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'prompt-library',locale:NS},Page));
  ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'prompt-library-bar',order:30},Dock));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'prompt-library-overlay',order:100},Overlay));
  ctx.effect(()=>()=>{cancel();listeners.clear();bindings.clear();});
 }};
}});
