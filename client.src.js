window.__ModuleLoader__.load({id:'dsh-prompt-library',factory(require){
 const React=require('react'),h=React.createElement,{useState,useEffect,useRef}=React;
 /*__SHARED__*/
 const DATA=/*__DATA__*/;
 const CSS=/*__CSS__*/;
 const NS='dsh-prompt-library',KEY=NS+':prefs';let ctx;
 const readPrefs=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')??{};}catch{return {};}};
 const old=readPrefs(),validIds=new Set(DATA.prompts.map(p=>p.id));
 let state={category:DATA.categories.some(c=>c.id===old.category)?old.category:'all',query:'',filter:'all',selected:validIds.has(old.lastPromptId)?old.lastPromptId:null,favorites:Array.isArray(old.favorites)?old.favorites.filter(x=>validIds.has(x)):[],recent:Array.isArray(old.recent)?old.recent.filter(x=>validIds.has(x)):[],currentSession:null,quick:null,notice:'',error:'',preference:{mode:'follow'},groups:[],configured:false,loading:false,job:null,undo:null,pending:null};
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
 const button=(label,onClick,extra={})=>h('button',{type:'button',className:'dpl-btn',onClick,...extra},label);
 const pad=n=>String(n).padStart(2,'0');
 const exampleText=prompt=>fillTemplate(prompt,prompt.exampleInput).text;
 function Icon({name}){return h('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true},h('path',{d:{copy:'M9 9h11v12H9z M4 15H2V2h13v3',insert:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',chevron:'m6 9 6 6 6-6'}[name]||'M5 12h14 M12 5v14'}));}
 function Status(){const s=useStore();return h('div',{'aria-live':'polite',className:'dpl-status'},s.error?h('p',{role:'alert',className:'dpl-error'},s.error):s.notice?h('p',null,s.notice):null);}
 function Sources({prompt}){return h('details',null,h('summary',null,'来源与推荐 Skill'),h('p',null,prompt.provenance.note),prompt.sourceIds.map(id=>{const source=DATA.sources.find(x=>x.id===id);return h('p',{key:id},h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.name),' · '+source.license+' · '+source.checkedAt);}),h('ul',null,prompt.ideas.map((idea,i)=>h('li',{key:i},idea))),prompt.skillIds.map(id=>{const skill=DATA.skills.find(x=>x.id===id);return h('div',{key:id},h('strong',null,skill.name),h('p',null,skill.when+'。'+skill.dependencies+'。未检测安装，不自动调用。'));}));}
 function Detail({prompt,target}){
  const text=exampleText(prompt);
  return h('div',{className:'dpl-spread',id:'dpl-spread-'+prompt.id},
   h('div',{className:'dpl-col-label'},h('span',{className:'dot','aria-hidden':true}),'完整示例 · 虚构演示数据'),
   h('div',{className:'dpl-col'},h('pre',{tabIndex:0,'aria-label':'完整提示词示例'},text)),
   h('div',{className:'dpl-spread-foot'},button('插入示例',()=>useTemplate(prompt,text,target),{disabled:!target,className:'dpl-btn is-primary'}),button('复制示例',()=>copy(text)),h('span',{className:'spacer'}),h('span',{className:'dpl-stamp'},'已审校'),h('span',{className:'dpl-review-note'},'未模型实测')),
   h('details',{className:'dpl-methods'},h('summary',null,'方法、验收与来源'),h('ul',null,prompt.acceptance.map((a,i)=>h('li',{key:i},a))),h(Sources,{prompt})));
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
  const s=useStore(),search=useRef(null),list=useRef(null),query=s.query.trim().toLowerCase();
  let prompts=DATA.prompts.filter(p=>(s.category==='all'||p.category===s.category)&&(!query||[p.title,p.purpose,...p.tags,p.body].join(' ').toLowerCase().includes(query))&&(s.filter==='all'||(s.filter==='favorites'?s.favorites:s.recent).includes(p.id)));
  if(s.filter==='recent')prompts.sort((a,b)=>s.recent.indexOf(a.id)-s.recent.indexOf(b.id));
  const categories=[{id:'all',label:'全部'},...DATA.categories];
  const selectCategory=id=>{update({category:id,selected:null});persist({category:id});};
  const rowKey=(e,p,index)=>{if(e.isComposing)return;const keys=['ArrowDown','ArrowUp','Home','End'];if(keys.includes(e.key)){e.preventDefault();const rows=list.current.querySelectorAll('.dpl-row-body'),next=e.key==='Home'?0:e.key==='End'?rows.length-1:index+(e.key==='ArrowDown'?1:-1);rows[Math.max(0,Math.min(rows.length-1,next))]?.focus();}if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='c'){e.preventDefault();copy(exampleText(p));}if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='i'){e.preventDefault();useTemplate(p,exampleText(p),target);}};
  return h(React.Fragment,null,
   h('header',{className:'dpl-masthead'},h('div',{className:'dpl-masthead-main'},h('div',{className:'dpl-kicker'},'PROMPT INDEX'),h('h1',{className:'dpl-title'},'提示词',h('em',null,'索引'))),h('div',{className:'dpl-count'},h('b',null,DATA.prompts.length),h('span',null,'PROMPTS')),h('div',{className:'dpl-panel-tools'},button('优化提示词',()=>openQuick('optimize',target)),button('模型设置',()=>openQuick('settings',target)),compact?button('×',closeQuick,{className:'dpl-close','aria-label':'关闭提示词库'}):null)),
   h('nav',{className:'dpl-rail',role:'tablist','aria-label':'任务分类'},categories.map((c,index)=>h('button',{type:'button',key:c.id,className:'dpl-tab',id:'dpl-tab-'+c.id,role:'tab','aria-selected':s.category===c.id,'aria-controls':'dpl-list',tabIndex:s.category===c.id?0:-1,onClick:()=>selectCategory(c.id),onKeyDown:e=>{if(e.isComposing||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?categories.length-1:(index+(e.key==='ArrowRight'?1:-1)+categories.length)%categories.length;selectCategory(categories[next].id);e.currentTarget.parentElement.querySelectorAll('.dpl-tab')[next]?.focus();}},h('span',{className:'n'},pad(index)),h('span',{className:'label'},c.label),h('span',{className:'n'},c.id==='all'?DATA.prompts.length:DATA.prompts.filter(p=>p.category===c.id).length)))),
   h('div',{className:'dpl-searchbar'},h(Icon,{name:'search'}),h('input',{type:'search',ref:search,placeholder:'搜索提示词…',value:s.query,'aria-label':'搜索提示词',onChange:e=>update({query:e.target.value}),onKeyDown:e=>{if(!e.isComposing&&e.key==='ArrowDown'){e.preventDefault();list.current?.querySelector('.dpl-row-body')?.focus();}}}),h('select',{className:'dpl-scope',value:s.filter,'aria-label':'提示词范围',onChange:e=>update({filter:e.target.value})},h('option',{value:'all'},'全部'),h('option',{value:'favorites'},'收藏'),h('option',{value:'recent'},'最近使用')),h('span',{className:'dpl-scope'},prompts.length+' 条')),
   h('div',{className:'dpl-list',id:'dpl-list',role:'tabpanel','aria-labelledby':'dpl-tab-'+s.category,ref:list},prompts.length?prompts.map((p,index)=>h('div',{key:p.id,className:'dpl-row'+(s.selected===p.id?' is-open':''),style:{'--dpl-i':String(Math.min(index,12))}},h('span',{className:'dpl-idx'},pad(index+1)),h('button',{type:'button',className:'dpl-row-body','aria-expanded':s.selected===p.id,'aria-controls':'dpl-spread-'+p.id,onClick:()=>update({selected:s.selected===p.id?null:p.id}),onKeyDown:e=>rowKey(e,p,index)},h('span',{className:'dpl-row-title'},h('span',{className:'t'},p.title)),h('span',{className:'dpl-excerpt'},p.purpose)),h('div',{className:'dpl-actions'},button(h(Icon,{name:'insert'}),()=>useTemplate(p,exampleText(p),target),{className:'dpl-act',disabled:!target,title:'插入示例','aria-label':'插入示例 · '+p.title}),button(h(Icon,{name:'copy'}),()=>copy(exampleText(p)),{className:'dpl-act',title:'复制示例','aria-label':'复制示例 · '+p.title}),button(s.favorites.includes(p.id)?'★':'☆',()=>star(p.id),{className:'dpl-act','aria-label':(s.favorites.includes(p.id)?'取消收藏':'收藏')+' · '+p.title})),s.selected===p.id?h(Detail,{prompt:p,target}):null)):h('div',{className:'dpl-empty'},h('div',{className:'dpl-empty-title'},'没有匹配的提示词'),h('p',{className:'dpl-empty-note'},'换个关键词，或查看全部分类。'),button('清除筛选',()=>update({query:'',category:'all',filter:'all'})))),
   h('footer',{className:'dpl-foot'},target?'插入当前对话 · 保留草稿，不自动发送':'可直接复制示例', ' · ↑↓ 浏览 · C 复制 · I 插入'),h(Status));
 }
 function Page(){const s=useStore();return h('div',{className:'dpl-panel dpl-page'},h(Style),h(Library,{target:s.currentSession}));}
 function Dock(props){
  const input=props.useInput(x=>x),selection=props.useProjection('modelSelection'),bindingRef=useRef({mounted:false}),barRef=useRef(null);const s=useStore();
  const binding=bindingRef.current;binding.sessionId=props.sessionId;binding.input=input;binding.model=selection?.next??selection?.lastUsed;binding.actions=props.inputActions;
  useEffect(()=>{binding.mounted=true;binding.bar=barRef.current;bindings.set(props.sessionId,binding);update({currentSession:props.sessionId});return()=>{binding.mounted=false;update({});};},[props.sessionId]);
  useEffect(()=>{update({});const pending=state.pending;if(pending&&pending.target===props.sessionId){update({pending:null});try{insert(binding,DATA.prompts.find(p=>p.id===pending.promptId),pending.text,pending.snapshot);}catch(error){update({error:error.message});}}},[props.sessionId,input.draftRev,input.phase]);
  const category=DATA.categories.find(c=>c.id===s.category),featured=DATA.prompts.find(p=>p.id===s.selected)??DATA.prompts.find(p=>!category||p.category===category.id);
  const expanded=s.quick?.mode==='library'&&s.quick.sessionId===props.sessionId;
  const toggle=()=>expanded?closeQuick():openQuick('library',props.sessionId);
  return h('div',{className:'dpl-bar',ref:barRef,'data-dpl-bar':true},h(Style),h('button',{type:'button',className:'dpl-bar-anchor',onClick:toggle,'aria-expanded':expanded,'aria-haspopup':'dialog'},h('span',{className:'dpl-bar-kicker'},'PROMPT INDEX'),h('span',{className:'dpl-bar-name'},'提示词库'),h('span',{className:'dpl-bar-cat'},(category?.label??'全部')+' · '+DATA.prompts.filter(p=>!category||p.category===category.id).length),h('span',{className:'dpl-bar-excerpt'},featured?.title??'')),button(h(Icon,{name:'chevron'}),toggle,{className:'dpl-bar-expand','aria-label':expanded?'收起提示词库':'展开提示词库','aria-expanded':expanded}));
 }
 function PolishButton(props){const s=useStore();return h('button',{type:'button',className:'dpl-polish',title:'优化当前草稿，按所选模型计费',onClick:()=>openQuick('optimize',props.sessionId??s.currentSession)},h(Style),h('span',{'aria-hidden':true},'✧'),s.job?.status==='running'?'优化中…':'优化提示词');}
 function Overlay(){
  const s=useStore(),panel=useRef(null),previous=useRef(null),[geometry,setGeometry]=useState(null);
  const mode=s.quick?.mode,target=s.quick?.sessionId;
  useEffect(()=>{if(!mode)return;previous.current=document.activeElement;const frame=requestAnimationFrame(()=>panel.current?.querySelector(mode==='library'?'input[type=search]':'button')?.focus());return()=>{cancelAnimationFrame(frame);if(previous.current?.isConnected)previous.current.focus();};},[mode,target]);
  useEffect(()=>{if(!mode)return;const bar=bindings.get(target)?.bar;
   const measure=()=>{if(!bar?.isConnected||mode!=='library'){setGeometry(null);return;}const r=bar.getBoundingClientRect(),vh=window.visualViewport?.height??window.innerHeight,topInset=Math.max(52,parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top'))||0),width=Math.min(r.width,window.innerWidth-24),height=Math.min(620,Math.max(0,r.top-topInset-12));setGeometry(height>=200?{left:Math.min(Math.max(12,r.left),window.innerWidth-width-12),top:r.top-height-8,width,height}:null);};
   measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;if(bar)observer?.observe(bar);window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);window.visualViewport?.addEventListener('resize',measure);
   const outside=e=>{if(mode==='library'&&!panel.current?.contains(e.target)&&!bar?.contains(e.target))closeQuick();};document.addEventListener('pointerdown',outside,true);
   return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);window.visualViewport?.removeEventListener('resize',measure);document.removeEventListener('pointerdown',outside,true);};
  },[mode,target]);
  if(!s.quick)return null;
  const anchored=mode==='library'&&geometry;
  function keydown(e){if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeQuick();}if(e.key==='Tab'){const nodes=[...panel.current.querySelectorAll('button,input,select,textarea,a,summary,pre[tabindex]')].filter(el=>!el.disabled&&el.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  const body=mode==='library'?h(Library,{compact:true,target}):h(React.Fragment,null,h('header',{className:'dpl-masthead'},h('div',{className:'dpl-masthead-main'},h('div',{className:'dpl-kicker'},'PROMPT INDEX'),h('h1',{className:'dpl-title'},mode==='settings'?'模型设置':'优化提示词')),button('×',closeQuick,{className:'dpl-close','aria-label':'关闭'})),h('div',{className:'dpl-settings-body'},mode==='settings'?h(ModelSettings):h(Optimizer,{target}),h(Status)));
  return h('div',{className:anchored?'dpl-overlay-anchor':'dpl-mask'},h(Style),h('div',{className:'dpl-panel '+(anchored?'dpl-anchored':'dpl-dialog'),ref:panel,style:anchored?geometry:undefined,role:'dialog','aria-modal':!anchored,'aria-label':mode==='library'?'提示词库':mode==='settings'?'模型设置':'优化提示词',onKeyDown:keydown},body));
 }
 return {inject:['slots','locale','layout'],apply(context){ctx=context;const dict={meta:{title:'提示词库',description:'精选任务模板、Skill方法与AI提示词优化'},library:'提示词库'};ctx.effect(()=>ctx.locale.register(NS,'zh',dict));ctx.effect(()=>ctx.locale.register(NS,'en',{meta:{title:'Prompt library',description:'Curated task prompts and AI prompt optimization'},library:'Prompt library'}));
  const Entry=()=>h('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M5 3h14v18l-7-4-7 4z'}));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'prompt-library',order:-8,locale:NS,label:()=>ctx.locale.bind(NS)('library')},Entry));
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'prompt-library',locale:NS},Page));
  ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'prompt-library-bar',order:30},Dock));
  ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'prompt-library-polish',order:30},PolishButton));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'prompt-library-overlay',order:100},Overlay));
  ctx.effect(()=>()=>{cancel();listeners.clear();bindings.clear();});
 }};
}});
