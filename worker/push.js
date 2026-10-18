import webpush from 'web-push';
import {context,record,commit,HttpsError} from './platform.js';
import {json} from './routes.js';
const supported=endpoint=>{try{const url=new URL(endpoint);return url.protocol==='https:'&&url.port===''&&(/^(?:fcm.googleapis.com|web.push.apple.com|(?:[a-z0-9-]+\.)*push.services.mozilla.com|(?:[a-z0-9-]+\.)*notify.windows.com)$/.test(url.hostname));}catch{return false;}};
export async function pushRoute(request,url){
 const {env,user}=context();
 if(url.pathname==='/api/push/config')return json({publicKey:env.VAPID_PUBLIC_KEY||''});
 if(url.pathname!=='/api/push/subscribe'||request.method!=='POST')throw new HttpsError('not-found','Unknown notification endpoint');
 if(!user)throw new HttpsError('unauthenticated','Sign in first');
 const {subscription}=await request.json();
 if(!subscription||!supported(subscription.endpoint)||!subscription.keys?.p256dh||!subscription.keys?.auth||JSON.stringify(subscription).length>8192)throw new HttpsError('invalid-argument','Invalid push subscription');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint));
 const id=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 await commit([{action:'set',path:'users/'+user.uid+'/pushSubscriptions/'+id,data:{subscription,updatedAt:Date.now()}}]);
 return json({success:true});
}
export async function sendNotification(event){
 const {env,origin}=context();if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return;
 const data=event.data.data();
 if(data.recipientId!==event.params.userId)return;
 const profile=(await record('users/'+event.params.userId))?.data;
 if(profile?.notificationPreferences?.pushEnabled===false)return;
 const rows=await env.DB.prepare('SELECT * FROM documents WHERE collection=?').bind('users/'+event.params.userId+'/pushSubscriptions').all();
 for(const row of rows.results){
  const subscription=JSON.parse(row.data).subscription;if(!subscription||!supported(subscription.endpoint))continue;
  const payload=JSON.stringify({title:'AIAS Basra Community',body:data.body||data.message||data.actorName||'New community activity',notificationId:event.params.notificationId,url:origin+'/community.html'+(data.postId?'?post='+encodeURIComponent(data.postId):'')});
  const details=webpush.generateRequestDetails(subscription,payload,{vapidDetails:{subject:'mailto:basrah@aias.org',publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:86400});
  const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body});
  if(response.status===404||response.status===410)await env.DB.prepare('DELETE FROM documents WHERE path=?').bind(row.path).run();
 }
}
