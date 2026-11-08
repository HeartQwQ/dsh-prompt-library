import {readFileSync,writeFileSync} from 'node:fs';
import {validateCatalog} from './shared.mjs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const catalog=JSON.parse(read('data/catalog.json')),sources=JSON.parse(read('data/sources.json')).sources,skills=JSON.parse(read('data/skills.json')).skills;
validateCatalog(catalog,sources,skills);
const replacements={SHARED:read('shared.mjs').replace(/export /g,''),DATA:JSON.stringify({...catalog,sources,skills}),CSS:JSON.stringify(read('library.css'))};
let client=read('client.src.js');for(const [key,value]of Object.entries(replacements))client=client.replace('/*__'+key+'__*/',()=>value);
new vm.Script(client,{filename:'client.js'});
if(process.argv.includes('--check')){if(read('client.js')!==client)throw Error('生成产物过期，请运行node build-library.mjs');}
else writeFileSync(new URL('client.js',import.meta.url),client);
console.log('Catalogue validated; '+catalog.prompts.length+' templates; Client syntax and generated payload passed.');
