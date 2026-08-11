const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

function destinationFor(notification) {
  if (notification.type === 'connection') return '/community.html?view=profile&user=' + encodeURIComponent(notification.actorId || '');
  if (notification.type === 'space_connection' || notification.type === 'space_request') return '/a/' + encodeURIComponent(notification.detailId || '');
  return '/community.html?post=' + encodeURIComponent(notification.postId || '') + '&comments=1';
}

function notificationBody(notification) {
  const actor = notification.actorName || 'A community member';
  const action = {
    connection:'connected with you',
    space_connection:'connected with your space',
    space_request:'requested access to your space',
    reply:'replied to your comment',
    applause:'applauded your post'
  }[notification.type] || 'commented on your post';
  return actor + ' ' + action + (notification.postTitle ? ' · ' + notification.postTitle : '');
}

exports.sendCommunityPush = onDocumentCreated('users/{userId}/notifications/{notificationId}', async event => {
  const notification = event.data?.data();
  const userId = event.params.userId;
  if (!notification || notification.recipientId !== userId) return;

  const tokenSnapshot = await admin.firestore().collection('users').doc(userId).collection('fcmTokens').get();
  const tokenDocs = tokenSnapshot.docs.filter(item => typeof item.data().token === 'string' && item.data().token);
  if (!tokenDocs.length) return;

  const response = await admin.messaging().sendEachForMulticast({
    tokens:tokenDocs.map(item => item.data().token),
    data:{
      notificationId:event.params.notificationId,
      title:'AIAS Basra Community',
      body:notificationBody(notification),
      url:destinationFor(notification)
    },
    webpush:{headers:{TTL:'86400'}}
  });

  const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
  const removals = response.responses.map((result, index) => result.success || !invalidCodes.has(result.error?.code) ? null : tokenDocs[index].ref.delete()).filter(Boolean);
  if (removals.length) await Promise.all(removals);
  logger.info('Community push processed.', {userId, sent:response.successCount, failed:response.failureCount});
});
