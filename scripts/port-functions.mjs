import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const versions=new Map(),assistants=new Map(),routes=[];
await mkdir('worker/community/versions',{recursive:true});
await mkdir('worker/community/assistants',{recursive:true});
function replaceNodes(source,edits){for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.value+source.slice(edit.end);return source;}
for(const name of await readdir('.migration/deployed-functions')){
  if(name==='sendCommunityPush')continue;
  const source=await readFile(`.migration/deployed-functions/${name}/index.js`,'utf8');
  let assistant='';try{assistant=await readFile(`.migration/deployed-functions/${name}/ai_assistant.js`,'utf8');}catch{}
  const aiHash=digest(assistant);
  if(assistant&&!assistants.has(aiHash)){
    const tree=parse(assistant,{ecmaVersion:'latest'}),edits=[];
    for(const node of tree.body){
      if(node.type==='VariableDeclaration'&&node.declarations.some(d=>d.init?.type==='CallExpression'&&d.init.callee.name==='require'))edits.push({...node,value:''});
      if(node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&assistant.slice(node.expression.left.start,node.expression.left.end)==='module.exports')edits.push({start:node.expression.left.start,end:node.expression.right.start,value:'export default '});
    }
    let output=replaceNodes(assistant,edits).replace(/process\.env\.([A-Z_0-9]+)/g,'context().env.$1').replaceAll('https://space-42d87.web.app','https://aiasbsr.com');
    output="import OpenAI from 'openai';\nimport {GoogleGenAI} from '@google/genai';\nimport {getStorage,FieldValue,context} from '../../platform.js';\n"+output;
    await writeFile(`worker/community/assistants/${aiHash}.js`,output);assistants.set(aiHash,true);
  }
  const hash=digest(source+aiHash);
  if(!versions.has(hash)){
    const tree=parse(source,{ecmaVersion:'latest'}),edits=[];let aiBinding='';
    for(const node of tree.body){
      if(node.type==='VariableDeclaration')for(const declaration of node.declarations){
        if(declaration.init?.type==='CallExpression'&&declaration.init.callee.name==='require'){
          const module=declaration.init.arguments[0].value;
          if(module==='./ai_assistant')aiBinding=source.slice(declaration.id.start,declaration.id.end);
          else if(!module.startsWith('firebase-'))throw new Error('Review server dependency: '+module);
          edits.push({...node,value:''});
        }
        if(declaration.id.name==='SARAY_ORIGIN')edits.push({...node,value:"const SARAY_ORIGIN = 'https://aiasbsr.com';"});
      }
      if(node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&source.slice(node.expression.left.start,node.expression.left.end)==='exports.sendCommunityPush')edits.push({...node,value:''});
      if(node.type==='FunctionDeclaration'&&node.id.name==='publicStorageImage')edits.push({...node,value:"async function publicStorageImage(path) { return path ? context().origin + '/media/' + encodeURIComponent(String(path)) : ''; }"});
    }
    let output=replaceNodes(source,edits).replace(/\bexports\./g,'functions.');
    const header="import {initializeApp,getFirestore,FieldValue,Timestamp,getStorage,onCall,onRequest,onDocumentCreated,onDocumentWritten,HttpsError,logger,context} from '../../platform.js';\nexport const functions = {};\n"+(aiBinding?`import assistant from '../assistants/${aiHash}.js';\nconst ${aiBinding} = assistant;\n`:'');
    await writeFile(`worker/community/versions/${hash}.js`,header+output);versions.set(hash,versions.size);
  }
  routes.push({name,hash});
}
const imports=[...versions].map(([hash,index])=>`import {functions as version${index}} from './versions/${hash}.js';`).join('\n');
const exports=routes.map(route=>`${JSON.stringify(route.name)}:version${versions.get(route.hash)}.${route.name}`).join(',\n');
await writeFile('worker/community/handlers.js',imports+'\nexport const communityHandlers = {\n'+exports+'\n};\n');
console.log(`Ported ${routes.length} deployed function handlers from ${versions.size} source versions and ${assistants.size} assistant versions. Firebase runtime imports have been removed.`);
