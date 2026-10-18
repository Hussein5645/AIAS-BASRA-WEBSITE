import test from 'node:test';
import assert from 'node:assert/strict';
import {validPath,publicRead,areaFor,mergeData,isSuper} from '../worker/policy.js';
import worker from '../worker/index.js';
test('rejects traversal, encoded traversal, control characters and empty path segments',()=>{
  for(const path of ['../config/admins','content/../admins','content//events','content/%2e%2e','content/\\events','content/\u0000']) assert.equal(validPath(path),false,path);
  assert.equal(validPath('content/events/items/abc'),true);
});
test('private member and administrative data is not public',()=>{
  for(const path of ['config/admins','config/roles','users/123','marketOrders','communityMessages','sessions']) assert.equal(publicRead(path),false,path);
  assert.equal(publicRead('content/events/items'),true);
  assert.equal(publicRead('config/portfolioTags'),true);
});
test('permissions resolve content to its administration area',()=>{
  assert.equal(areaFor('content/magazine/articles/123'),'articles');
  assert.equal(areaFor('content/events/items/123/imageChunks/file'),'events');
  assert.equal(areaFor('config/roles'),null);
});
test('merge preserves siblings and supports nested dotted fields',()=>{
  assert.deepEqual(mergeData({workshop:{title:'A',lecturer:'B'}},{'workshop.title':'C'}),{workshop:{title:'C',lecturer:'B'}});
  assert.throws(()=>mergeData({},JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.throws(()=>mergeData({},{'constructor.prototype.polluted':true}));
  assert.equal({}.polluted,undefined);
  assert.deepEqual(mergeData({},{assignments:{'member@example.com':'event_editor'}}),{assignments:{'member@example.com':'event_editor'}});
});
test('bootstrap administrators are an exact case-insensitive email match',()=>{
  const env={ADMIN_EMAILS:'basrah@aias.org'};
  assert.equal(isSuper({email:'BASRAH@AIAS.ORG'},env),true);
  assert.equal(isSuper({email:'evilbasrah@aias.org'},env),false);
  assert.equal(isSuper(null,env),false);
});
test('cross-origin mutation is rejected before database access',async()=>{
  const response=await worker.fetch(new Request('https://example.com/api/db',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{});
  assert.equal(response.status,403);
});
test('an unconfigured backend reports setup required',async()=>{
  const response=await worker.fetch(new Request('https://example.com/api/auth/session'),{});
  assert.equal(response.status,503);
});
test('unsafe media paths fail before R2 access',async()=>{
  const response=await worker.fetch(new Request('https://example.com/media/content%2F..%2Fprivate'),{});
  assert.equal(response.status,400);
});
