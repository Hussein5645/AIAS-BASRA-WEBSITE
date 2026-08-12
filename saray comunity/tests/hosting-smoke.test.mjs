import test from 'node:test';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5000';

async function response(path, options = {}) {
  return fetch(origin + path, options);
}

test('Saray hosting serves only the Community application and required assets', async () => {
  const checks = [
    ['/', 'AIAS Basra Community'],
    ['/a/architecture', 'AIAS Basra Community'],
    ['/p/member', 'AIAS Basra Community'],
    ['/project.html?communityPost=test', 'Community project'],
    ['/community-archived.html', 'Posts from unavailable spaces'],
    ['/admin-community-moderation.html', 'Community moderation'],
    ['/login.html', 'Login'],
    ['/signup.html', 'Create Account'],
    ['/auth-relay.html', 'Signing in'],
    ['/js/community.js', "projectId: 'space-42d87'"],
    ['/community-notifications-sw.js', "projectId:'space-42d87'"],
    ['/manifest.webmanifest', 'AIAS Basra Community']
  ];

  for (const [path, marker] of checks) {
    const result = await response(path);
    assert.equal(result.status, 200, `${path} should be served`);
    assert.match(await result.text(), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${path} should contain its expected marker`);
  }
});

test('legacy Community pages preserve compatibility redirects', async () => {
  const community = await response('/community.html?post=abc');
  assert.equal(community.status, 200);
  assert.match(await community.text(), /location\.replace\(destination\.href\)/);

  const projects = await response('/community-projects.html');
  assert.equal(projects.status, 200);
  assert.match(await projects.text(), /location\.replace\('\/\?view=selected'\)/);
});
