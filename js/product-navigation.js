// Keep product links consistent, including cards added after page load.
const professional=new Set(['portfolios.html','portfolio.html','portfolio-builder.html','portfolio-work.html','portfolio-pdf.html','portfolio-theme-builder.html','business.html','business-builder.html']);
const market=new Set(['market.html','store.html','store-manage.html','market-themes.html']);
function updateLinks(root=document){
  for(const button of root.querySelectorAll('[data-share-portfolio],[data-share-work],.market-community-share,[for="bizOppShareCommunity"]'))button.hidden=true;
  for(const input of root.querySelectorAll('#bizOppShareCommunity')){input.checked=false;input.disabled=true;input.hidden=true;if(input.closest('label'))input.closest('label').hidden=true;}
  for(const link of root.querySelectorAll('a[href]')){
    const raw=link.getAttribute('href');if(!raw||raw.startsWith('#'))continue;
    let url;try{url=new URL(raw,location.href);}catch{continue;}
    if(!['aiasbsr.com','www.aiasbsr.com','professional.aiasbsr.com','market.aiasbsr.com','community.aiasbsr.com',location.hostname].includes(url.hostname))continue;
    const page=url.pathname.split('/').pop();
    if(/^community(?:-[\w-]+)?\.html$/.test(page)||page==='download.html'||page==='project.html'||url.hostname==='community.aiasbsr.com'){
      link.hidden=true;link.setAttribute('aria-hidden','true');link.removeAttribute('href');continue;
    }
    let host=professional.has(page)?'professional':market.has(page)?'market':null;
    if(host){url.hostname=host+'.aiasbsr.com';url.protocol='https:';url.port='';if(['portfolios.html','market.html'].includes(page))url.pathname='/';}
    else if(page==='index.html'||page.startsWith('admin-')){url.hostname='aiasbsr.com';url.protocol='https:';url.port='';}
    if(url.href!==link.href)link.href=url.href;
  }
}
updateLinks();new MutationObserver(()=>updateLinks()).observe(document.documentElement,{childList:true,subtree:true});
