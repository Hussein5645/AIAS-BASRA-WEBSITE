import {request} from './cloudflare-client.js';
const $=id=>document.getElementById(id);
let objects=[],cursor=null;
function render(){
  const query=$('search').value.trim().toLowerCase();
  const filtered=objects.filter(o=>o.key.toLowerCase().includes(query));
  $('files').replaceChildren();
  $('count').textContent=`${objects.length} files loaded${cursor?' · More available':''}`;
  if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=query?'No files match your search.':'Your library is ready for its first upload.';$('files').append(empty);}
  for(const file of filtered){
    const card=document.createElement('article');card.className='file';
    const preview=document.createElement('div');preview.className='preview';
    if(/^image\/(png|jpeg|webp|gif)$/.test(file.contentType)){const image=document.createElement('img');image.src=file.url;image.alt='';image.loading='lazy';preview.append(image);}else preview.textContent=file.key.split('.').at(-1).slice(0,5).toUpperCase();
    const body=document.createElement('div');body.className='file-body';
    const name=document.createElement('div');name.className='file-name';name.textContent=file.key.split('/').at(-1);
    const meta=document.createElement('div');meta.className='file-meta';meta.textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${new Date(file.uploaded).toLocaleDateString()}`;
    const actions=document.createElement('div');actions.className='file-actions';
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy URL';copy.onclick=async()=>{try{await navigator.clipboard.writeText(new URL(file.url,location.origin).href);$('message').textContent='File URL copied.';}catch{$('message').textContent='Open the file and copy its address.';}};
    const open=document.createElement('a');open.href=file.url;open.target='_blank';open.rel='noopener';open.textContent='Open ↗';
    actions.append(copy,open);body.append(name,meta,actions);card.append(preview,body);$('files').append(card);
  }
  $('loadMore').hidden=!cursor;
}
async function load(append=false){
  $('files').setAttribute('aria-busy','true');
  try{const result=await request('/api/media'+(append&&cursor?'?cursor='+encodeURIComponent(cursor):''),undefined,'GET');objects=append?[...objects,...result.objects]:result.objects;cursor=result.cursor;render();}
  finally{$('files').setAttribute('aria-busy','false');}
}
$('search').oninput=render;
$('loadMore').onclick=()=>load(true).catch(e=>$('message').textContent=e.message);
$('uploadForm').onsubmit=async event=>{
  event.preventDefault();const file=$('file').files[0];if(!file)return;
  if(file.size>100*1024*1024){$('message').textContent='Choose a file smaller than 100 MB.';return;}
  $('uploadButton').disabled=true;$('message').textContent='Uploading to R2… Keep this page open.';
  try{await request('/api/media',new FormData(event.target));event.target.reset();$('message').textContent='Uploaded successfully. Your file is ready to use.';await load();}
  catch(e){$('message').textContent='Upload failed: '+e.message;}
  finally{$('uploadButton').disabled=false;}
};
try{
  await request('/api/health',undefined,'GET');$('connection').textContent='● All services connected';$('connection').className='badge ok';$('uploadButton').disabled=false;await load();
}catch(e){$('connection').textContent=e.status===401||e.status===403?'Sign in as an administrator':'Setup required';$('connection').className='badge error';$('message').textContent=e.message;$('files').setAttribute('aria-busy','false');const link=document.createElement('a');link.href='/api/auth/start?return=/admin-storage.html';link.textContent='Sign in →';$('files').append(link);}
