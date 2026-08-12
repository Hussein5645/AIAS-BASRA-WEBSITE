import test from 'node:test';
import assert from 'node:assert/strict';
import {isEligibleUnavailableSpacePost, shouldArchiveInSpaceCascade, shouldRestoreFromCascade} from '../public/js/moderation-policy.js';

test('space archive cascades only active posts', () => {
  assert.equal(shouldArchiveInSpaceCascade({archived:false}), true);
  assert.equal(shouldArchiveInSpaceCascade({archived:true, archiveCause:'moderation'}), false);
});

test('space restoration selects only posts from its exact cascade', () => {
  const matching = {archived:true, archiveCause:'space_cascade', archiveCascadeId:'cascade-a'};
  assert.equal(shouldRestoreFromCascade(matching, 'cascade-a'), true);
  assert.equal(shouldRestoreFromCascade({...matching, archiveCascadeId:'cascade-b'}, 'cascade-a'), false);
  assert.equal(shouldRestoreFromCascade({...matching, archiveCause:'moderation'}, 'cascade-a'), false);
});

test('reposting rejects flagged, independent, duplicate, and foreign archives', () => {
  const eligible = {userId:'owner', archived:true, archiveCause:'space_cascade', moderationStatus:'clear'};
  assert.equal(isEligibleUnavailableSpacePost(eligible, 'owner'), true);
  assert.equal(isEligibleUnavailableSpacePost({...eligible, moderationStatus:'flagged'}, 'owner'), false);
  assert.equal(isEligibleUnavailableSpacePost({...eligible, archiveCause:'moderation'}, 'owner'), false);
  assert.equal(isEligibleUnavailableSpacePost({...eligible, repostedPostId:'new'}, 'owner'), false);
  assert.equal(isEligibleUnavailableSpacePost(eligible, 'someone-else'), false);
});
