export const hosts = ['aiasbsr.com','www.aiasbsr.com','professional.aiasbsr.com','market.aiasbsr.com','community.aiasbsr.com'];
export const professionalPages = new Set(['portfolios.html','portfolio.html','portfolio-builder.html','portfolio-work.html','portfolio-pdf.html','portfolio-theme-builder.html','business.html','business-builder.html']);
export const marketPages = new Set(['market.html','store.html','store-manage.html','market-themes.html']);
export function communityPage(url) {
  return url.hostname==='community.aiasbsr.com' && !url.pathname.startsWith('/api/') && (url.pathname==='/'||url.pathname.endsWith('.html')) || /^\/(community(?:-[\w-]+)?(?:\.html)?|project\.html|download\.html|share(?:\/.*)?|[ap]\/[^/]+)\/?$/.test(url.pathname) || url.pathname==='/'&&(url.searchParams.has('post')||url.searchParams.has('view'));
}
export function canonical(url) {
  if(!hosts.includes(url.hostname))return null;
  const next=new URL(url),page=url.pathname.slice(1);
  if(page.startsWith('admin-')||page==='index.html'){next.hostname='aiasbsr.com';}
  else if(professionalPages.has(page)){next.hostname='professional.aiasbsr.com';if(page==='portfolios.html')next.pathname='/';}
  else if(marketPages.has(page)){next.hostname='market.aiasbsr.com';if(page==='market.html')next.pathname='/';}
  else if(communityPage(url)){next.hostname='community.aiasbsr.com';if(['/community','/community.html'].includes(next.pathname))next.pathname='/';}
  else if(page.startsWith('admin-')||page==='index.html'||url.hostname==='www.aiasbsr.com'){next.hostname='aiasbsr.com';}
  if(next.href!==url.href)return next;
  return null;
}
export function safeReturn(value,origin) {
  const target=new URL(value,origin),base=new URL(origin);
  if(target.username||target.password||target.protocol!==base.protocol||!(hosts.includes(target.hostname)&&target.protocol==='https:'&&!target.port||target.origin===base.origin&&!hosts.includes(base.hostname)))throw Object.assign(new Error('Invalid return address'),{status:400});
  return target;
}
export const authOrigin=url=>hosts.includes(url.hostname)?'https://aiasbsr.com':url.origin;
