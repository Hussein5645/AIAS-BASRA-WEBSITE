export function shouldArchiveInSpaceCascade(post) {
  return post?.archived !== true;
}

export function shouldRestoreFromCascade(post, cascadeId) {
  return Boolean(cascadeId) && post?.archived === true && post?.archiveCause === 'space_cascade' && post?.archiveCascadeId === cascadeId;
}

export function isEligibleUnavailableSpacePost(post, userId) {
  return Boolean(userId) && post?.userId === userId && post?.archived === true && post?.archiveCause === 'space_cascade' && post?.moderationStatus !== 'flagged' && !post?.repostedPostId;
}
