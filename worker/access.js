// Server-side equivalent of the deployed access rules. Unknown paths are denied.
import {context,record,HttpsError} from './platform.js';
import {areaFor,isSuper,publicRead,mergeData} from './policy.js';
const value=async path=>(await record(path))?.data;
const keysOnly=(data,keys)=>Object.keys(data||{}).every(key=>keys.includes(key));
const changedOnly=(before,after,keys)=>[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].every(key=>JSON.stringify(before?.[key])===JSON.stringify(after?.[key])||keys.includes(key));
const text=(item,max,min=0)=>typeof item==='string'&&item.length>=min&&item.length<=max;
export async function permissions(){
  const store=context(),user=store.user;if(!user)return [];
  if(store.permissions)return store.permissions;
  if(isSuper(user,store.env))return store.permissions=['*'];
  const admins=await value('config/admins');if(admins?.admins?.some(email=>email.toLowerCase()===user.email.toLowerCase()))return store.permissions=['*'];
  const assignments=await value('config/userRoles'),roles=await value('config/roles');
  const role=assignments?.assignments?.[user.email.toLowerCase()];
  return store.permissions=roles?.roles?.[role]?.permissions||[];
}
const has=async(name)=>{const list=await permissions();return list.includes('*')||list.includes(name);};
export const isAdministrator=async()=>(await permissions()).length>0;
// Professional uses private direct conversations, but never Community spaces or posts.
export async function releasedPath(path){
  const p=path.split('/');
  if(!/^community(?:Posts|Spaces|Settings|Moderation)/.test(p[0]))return true;
  if(await isAdministrator())return true;
  if(p[0]!=='communitySpaces')return false;
  const space=await value('communitySpaces/'+p[1]);
  return !!context().user&&space?.isDirectMessage===true&&space.directParticipants?.includes(context().user.uid)&&(!p[2]||['messages','messageReads','chatPresence'].includes(p[2]));
}
export async function spaceManager(spaceId,user=context().user){if(!user)return false;const space=await value('communitySpaces/'+spaceId);return space?.creatorId===user.uid||!!(await value(`communitySpaces/${spaceId}/admins/${user.uid}`));}
export async function chatMember(spaceId){
  const user=context().user;if(!user)return false;
  const space=await value('communitySpaces/'+spaceId);
  if(space?.isDirectMessage===true)return space.directParticipants?.includes(user.uid)||false;
  const access=await value(`communitySpaces/${spaceId}/access/${user.uid}`);
  return !!access?.canUseChat&&!access.blocked&&!access.chatBanned;
}
export async function canReadPost(post){
  if(!await isAdministrator())return false;
  if(!post)return false;const user=context().user,slug=post.communitySlug||'main';
  if(await has('view_community')||await has('manage_community'))return true;
  if(user?.uid===post.userId&&post.archived===true&&post.moderationStatus!=='flagged')return true;
  if(post.published!==true||post.archived===true||post.moderationStatus==='flagged')return false;
  const access=user&&slug!=='main'?await value(`communitySpaces/${slug}/access/${user.uid}`):null;
  if(access?.blocked)return false;
  return (post.visibility||'public')==='public'||!!access?.canReadPosts;
}
export async function storeAdmin(storeId){
  const user=context().user;if(!user)return false;const store=await value('marketStores/'+storeId);if(!store)return false;
  return store.adminUids?.includes(user.uid)||store.adminEmails?.map(s=>s.toLowerCase()).includes(user.email.toLowerCase())||store.storeAdmins?.map(s=>s.toLowerCase()).includes(user.email.toLowerCase())||false;
}
export async function canRead(path,data){
  if(!await releasedPath(path))return false;
  const user=context().user,p=path.split('/'),root=p[0];
  if((await permissions()).includes('*'))return true;
  if(root==='professionalAccounts')return user?.uid===p[1]||await has('view_professional')||await has('manage_professional');
  if(publicRead(path))return true;
  if(root==='config')return !!user;
  if(root==='publicProfiles'||root==='businessAccounts'||root==='businessProfiles'||root==='communitySettings'||root==='usernames')return true;
  if(root==='marketStores'||root==='marketItems')return true;
  if(root==='users'){
    if(p.length===2)return user?.uid===p[1]||await has('view_community')||await has('manage_community');
    if(['connections','followers'].includes(p[2]))return true;
    return user?.uid===p[1];
  }
  if(root==='communitySpaces'){
    if(await has('view_community')||await has('manage_community'))return true;
    if(p.length===2)return data?.isDirectMessage?!!user&&data.directParticipants?.includes(user.uid):data?.archived!==true;
    if(p[2]==='connections')return true;
    if(p[2]==='admins')return !!user;
    if(['messages','messageReads','chatPresence'].includes(p[2]))return chatMember(p[1]);
    if(['access','chatBans','blocks','chatAccessRequests','connectionRequests'].includes(p[2]))return !!user&&(user.uid===p[3]||await spaceManager(p[1]));
    return false;
  }
  if(root==='communityPosts'){
    const post=p.length===2?data:await value('communityPosts/'+p[1]);
    if(p[2]==='votes')return !!user&&user.uid===p[3]&&await canReadPost(post)||await has('view_community')||await has('manage_community');
    return canReadPost(post);
  }
  if(root.startsWith('communityModeration'))return await has('view_community')||await has('manage_community');
  if(root==='portfolioProfiles')return data?.status==='published'||user?.uid===p[1]||await has('manage_community');
  if(root==='portfolioWorks')return data?.status==='published'&&data?.moderationStatus==='clear'||!!user&&data?.ownerId===user.uid||await has('manage_community');
  if(root==='portfolioProfileDrafts')return !!user&&p[1]===user.uid;
  if(root==='portfolioWorkDrafts')return !!user&&data?.ownerId===user.uid;
  if(root==='portfolioThemes')return data?.status==='published'||!!user&&data?.ownerId===user.uid||await has('manage_market');
  if(root==='businessPosts')return data?.status==='published'||!!user&&data?.ownerUid===user.uid||await has('manage_community');
  if(root==='businessOpportunities')return ['open','closed','filled'].includes(data?.status)||!!user&&data?.ownerUid===user.uid||await has('manage_community');
  if(root==='jobApplications')return !!user&&(data?.applicantUid===user.uid||data?.businessUid===user.uid||await has('manage_community'));
  if(root==='marketOrders')return await has('manage_market')||!!user&&(data?.buyerUid===user.uid||data?.buyerEmail===user.email||await storeAdmin(data?.storeId));
  return false;
}
export async function authorizeWrite(operation,before){
  if(!await releasedPath(operation.path))throw new HttpsError('permission-denied','Community is available to administrators only.');
  const user=context().user;if(!user)throw new HttpsError('unauthenticated','Sign in to continue.');
  const {path,action}=operation,p=path.split('/'),data=operation.data||{};
  if((await permissions()).includes('*'))return;
  const deleting=action==='delete',creating=!before;
  const after=operation.merge||action==='update'?mergeData(before,data):data;
  let allowed=false;
  if(p[0]==='content'){
    const area=areaFor(path);allowed=!!area&&await has('manage_'+area);
    if(p[1]==='magazine'&&p[2]==='articles'&&p.length===6){
      if(p[4]==='votes')allowed=p[5]===user.uid&&!deleting&&keysOnly(data,['userId','value','updatedAt'])&&data.userId===user.uid&&[-1,0,1].includes(data.value);
      if(p[4]==='comments')allowed=deleting?before?.userId===user.uid:creating&&data.userId===user.uid&&text(data.text,5000,1)&&keysOnly(data,['userId','userName','text','parentId','createdAt']);
    }
  }else if(p[0]==='config'){
    allowed=['marketTypes','marketTags'].includes(p[1])&&await has('manage_market')||p[1]==='portfolioTags'&&await has('manage_professional');
  }else if(p[0]==='users'){
    if(p.length===2&&p[1]===user.uid&&!deleting){
      const protectedFields=['verified','verifiedAt','verifiedBy','profileComplete','mainThreadPostingAccess','mainThreadAccessStatus','mainThreadAccessRequestedAt','mainThreadAccessReviewedAt','mainThreadAccessReviewedBy','isBusiness','businessStatus','businessApprovedAt','businessApprovedBy'];
      allowed=creating?after.profileComplete!==true&&after.mainThreadPostingAccess!==true&&!after.verified&&!after.isBusiness:Object.keys(data).every(key=>!protectedFields.includes(key));
      if(data.email!==undefined&&data.email!==user.email)allowed=false;
      if(data.username!==undefined){const reservation=await value('usernames/'+data.username);allowed=allowed&&reservation?.userId===user.uid;}
      if(Object.keys(data).some(key=>/role|permissions|admin/i.test(key)))allowed=false;
    }
    if(p.length===2&&await has('manage_community'))allowed=allowed||!deleting&&keysOnly(data,['verified','verifiedAt','verifiedBy'])&&typeof data.verified==='boolean'&&data.verifiedBy===user.email;
    if(p[2]==='connections'&&p.length===4)allowed=p[1]===user.uid&&p[3]!==user.uid&&(deleting||creating&&data.userId===user.uid&&data.targetUserId===p[3]&&!!(await value('users/'+p[3])));
    if(p[2]==='followers'&&p.length===4)allowed=p[3]===user.uid&&p[1]!==user.uid&&(deleting||creating&&data.userId===user.uid&&data.targetUserId===p[1]);
    if(p[2]==='notifications'&&p.length===4){
      if(deleting)allowed=p[1]===user.uid||before?.actorId===user.uid;
      else if(!creating)allowed=p[1]===user.uid&&keysOnly(data,['read','readAt']);
      else allowed=await authorizeNotification(p[1],data);
    }
  }else if(p[0]==='businessProfiles')allowed=deleting?await has('manage_community'):p[1]===user.uid&&(await value('businessAccounts/'+user.uid))?.status==='active';
  else if(['businessPosts','businessOpportunities'].includes(p[0]))allowed=deleting?before?.ownerUid===user.uid||await has('manage_community'):after.ownerUid===user.uid&&(!before||before.ownerUid===user.uid)&&(await value('businessAccounts/'+user.uid))?.status==='active';
  else if(p[0]==='jobApplications'){
    if(creating&&!deleting){const opportunity=await value('businessOpportunities/'+data.opportunityId);allowed=data.applicantUid===user.uid&&(await value('portfolioProfiles/'+user.uid))?.status==='published'&&opportunity?.ownerUid===data.businessUid&&opportunity.status==='open';}
    else if(deleting)allowed=before?.applicantUid===user.uid||before?.businessUid===user.uid||await has('manage_community');
    else allowed=(before?.businessUid===user.uid||await has('manage_community'))&&keysOnly(data,['status','updatedAt','notes']);
  }else if(p[0]==='usernames')allowed=creating&&!deleting&&/^[a-z0-9_]{3,24}$/.test(p[1])&&data.userId===user.uid;
  else if(p[0]==='communitySpaces'){
    if(p.length===2)allowed=!creating&&!deleting&&before.creatorId===user.uid&&keysOnly(data,['name','description','symbol','imageURL','bannerURL','updatedAt'])&&text(after.name,80,1)&&text(after.description,360,1)&&text(after.symbol,4,1);
    if(p[2]==='chatPresence'&&p.length===4)allowed=p[3]===user.uid&&(deleting||await chatMember(p[1])&&keysOnly(data,['userId','activeAt'])&&data.userId===user.uid);
  }else if(p[0]==='communityPosts'&&p.length===2)allowed=!creating&&!deleting&&before.userId===user.uid&&await canReadPost(before)&&keysOnly(data,['title','text','content','description','editedAt','featureRequest','featureStatus'])&&(!data.featureStatus||before.type==='behance'&&data.featureStatus==='pending'&&data.featureRequest===true);
  else if(p[0]==='communitySettings')allowed=await has('manage_community');
  else if(p[0]==='marketStores')allowed=await has('manage_market')||!creating&&!deleting&&await storeAdmin(p[1])&&keysOnly(data,['name','slug','bio','profileImage','bannerImage','updatedAt'])&&text(after.name,120,1)&&/^[a-z0-9-]{2,80}$/.test(after.slug)&&text(after.bio,1000);
  else if(p[0]==='marketItems')allowed=await has('manage_market')||!!after.storeId&&(!before||after.storeId===before.storeId)&&await storeAdmin(after.storeId);
  else if(p[0]==='marketOrders'){
    if(await has('manage_market'))allowed=true;
    else if(!creating&&!deleting)allowed=await storeAdmin(before?.storeId)&&keysOnly(data,['status','updatedAt'])&&['pending','completed','cancelled'].includes(data.status);
    else if(creating&&!deleting){const item=await value('marketItems/'+data.itemId),store=await value('marketStores/'+data.storeId);allowed=keysOnly(data,['itemId','storeId','storeName','buyerUid','buyerEmail','buyerName','buyerContact','notes','status','createdAt'])&&data.buyerUid===user.uid&&data.buyerEmail===user.email&&text(data.buyerName,120,1)&&text(data.buyerContact,160,1)&&text(data.notes,1000)&&data.status==='pending'&&item?.storeId===data.storeId&&item?.status==='active'&&store?.status==='active';}
  }
  if(!allowed)throw new HttpsError('permission-denied','You do not have permission for this operation.');
}
async function authorizeNotification(recipient,data){
  const user=context().user;
  if(!user||data.actorId!==user.uid||data.recipientId!==recipient||data.read!==false||!text(data.actorName,100)||!text(data.actorUsername,24)||!text(data.postTitle,160))return false;
  if(await has('manage_community')&&data.actorName==='AIAS Basra moderation'&&/^moderation_/.test(data.type))return text(data.reason,500);
  if(recipient===user.uid)return false;
  if(data.type==='connection')return data.detailId===recipient&&!!(await value(`users/${recipient}/followers/${user.uid}`));
  if(['space_connection','space_request'].includes(data.type)){const space=await value('communitySpaces/'+data.detailId);return space?.creatorId===recipient&&!!(await value(`communitySpaces/${data.detailId}/${data.type==='space_request'?'connectionRequests':'connections'}/${user.uid}`));}
  const post=await value('communityPosts/'+data.postId);if(!post||!await canReadPost(post))return false;
  if(data.type==='space_post')return post.userId===user.uid&&(await value('communitySpaces/'+post.communitySlug))?.creatorId===recipient;
  if(data.type==='applause')return post.userId===recipient&&(await value(`communityPosts/${data.postId}/votes/${user.uid}`))?.value===1;
  if(data.type==='comment')return post.userId===recipient&&(await value(`communityPosts/${data.postId}/comments/${data.detailId}`))?.userId===user.uid;
  if(data.type==='reply')return (await value(`communityPosts/${data.postId}/comments/${data.detailId}`))?.userId===recipient;
  if(data.type==='mention')return post.userId===user.uid||!!data.sourceId&&(await value(`communityPosts/${data.postId}/comments/${data.sourceId}`))?.userId===user.uid;
  if(data.type==='space_mention')return (await value('communitySpaces/'+data.detailId))?.creatorId===recipient&&(post.userId===user.uid||!!data.sourceId&&(await value(`communityPosts/${data.postId}/comments/${data.sourceId}`))?.userId===user.uid);
  return false;
}
export async function canAccessMedia(key,write=false,remove=false){
  const user=context().user,p=key.split('/');
  if(p[0]==='community'&&p[1]!=='profiles'&&!await isAdministrator()){
    if(p[1]!=='space-messages'||!await releasedPath('communitySpaces/'+p[2]))return false;
  }
  if((await permissions()).includes('*'))return true;
  const community=await has('manage_community'),market=await has('manage_market');
  if(p[0]==='community'){
    if(p[1]==='profiles')return !write||user?.uid===p[2];
    if(p[1]==='spaces')return !write||!!user&&(await value('communitySpaces/'+p[2]))?.creatorId===user.uid;
    if(p[1]==='space-messages')return await chatMember(p[2])&&(!write||!remove&&p[3]===user?.uid);
    if(p[1]==='posts'){
      const post=await value('communityPosts/'+p[2]);if(!write)return community||await canReadPost(post);
      if(!post||post.userId!==user?.uid||post.published===true||remove)return false;
      if((post.communitySlug||'main')==='main')return (await value('users/'+user.uid))?.mainThreadPostingAccess!==false;
      const access=await value(`communitySpaces/${post.communitySlug}/access/${user.uid}`);return !!access?.member&&!!access.canReadPosts&&!access.blocked;
    }
    return false;
  }
  if(p[0]==='portfolios'){
    if(write)return user?.uid===p[1];
    if(user?.uid===p[1]||community)return true;
    if(p[2]==='business')return true;
    if(p[2]==='profile')return (await value('portfolioProfiles/'+p[1]))?.status==='published';
    if(p[2]==='works'){const work=await value('portfolioWorks/'+p[3]);return work?.ownerId===p[1]&&work.status==='published'&&work.moderationStatus==='clear';}
    return false;
  }
  if(p[0]==='businesses')return !write||!!user&&p[1]===user.uid&&(remove||(await value('businessAccounts/'+user.uid))?.status==='active');
  if(p[0]==='market')return !write||market||p[1]==='stores'&&await storeAdmin(p[2]);
  if(p[0]==='uploads')return !write||(await permissions()).some(permission=>permission.startsWith('manage_'));
  if(p[0]==='content')return !write||!!areaFor(p.slice(0,-1).join('/'))&&await has('manage_'+areaFor(p.slice(0,-1).join('/')));
  if(!write){
    const link=await context().env.DB.prepare('SELECT * FROM asset_links WHERE key=?').bind(key).first();
    if(link)return !!link.is_public||await canRead(link.document_path,await value(link.document_path));
  }
  return false;
}
