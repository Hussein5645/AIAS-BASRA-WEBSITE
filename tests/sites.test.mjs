import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,communityPage,safeReturn} from '../worker/sites.js';
test('legacy product links use canonical subdomains and retain query strings',()=>{
 for(const [page,host]of [['portfolios','professional'],['market','market'],['community','community']])assert.equal(canonical(new URL(`https://aiasbsr.com/${page}.html?tab=connections`)).href,`https://${host}.aiasbsr.com/?tab=connections`);
 assert.equal(canonical(new URL('https://professional.aiasbsr.com/')),null);
});
test('OAuth returns allow only exact trusted origins',()=>{
 assert.equal(safeReturn('https://professional.aiasbsr.com/portfolio-builder.html','https://aiasbsr.com').hostname,'professional.aiasbsr.com');
 for(const target of ['https://evil.example','https://aiasbsr.com.evil.example','https://user:password@aiasbsr.com/','http://market.aiasbsr.com/','https://market.aiasbsr.com:8443/'])assert.throws(()=>safeReturn(target,'https://aiasbsr.com'));
});
test('Community page aliases are protected',()=>{
 for(const path of ['/community.html','/community','/community-projects.html','/project.html?communityPost=id','/share/id','/a/person','/?post=id'])assert.equal(communityPage(new URL(path,'https://aiasbsr.com')),true,path);
 assert.equal(communityPage(new URL('https://community.aiasbsr.com/')),true);
 assert.equal(communityPage(new URL('https://professional.aiasbsr.com/')),false);
});
