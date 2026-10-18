import {context,getFirestore,FieldValue,HttpsError} from './platform.js';
import {permissions} from './access.js';
const db=getFirestore();
const stamp=()=>FieldValue.serverTimestamp();
const clean=(value,max,required=false)=>{const text=String(value||'').trim();if(text.length>max||required&&!text)throw new HttpsError('invalid-argument','Please complete the required profile fields.');return text;};
const draft=(user,profile)=>({ownerId:user.uid,username:profile.username,displayName:profile.displayName||user.displayName||'',professionalTitle:'',location:profile.city||'',bio:profile.bio||'',avatarUrl:profile.photoURL||user.photoURL||'',status:'draft',skills:[],sections:[],contacts:[],createdAt:stamp(),updatedAt:stamp()});
export async function ensureProfessionalAccount(user){
 if(!user)return;
 const account=db.doc('professionalAccounts/'+user.uid);
 await db.runTransaction(async tx=>{
  const existing=await tx.get(account);
  const identity=await tx.get(db.doc('users/'+user.uid));const profile=identity.data()||{};
  if(!existing.exists)tx.set(account,{ownerId:user.uid,email:user.email,displayName:profile.displayName||user.displayName||'',username:profile.username||'',status:profile.profileComplete?'active':'onboarding',verified:false,createdAt:stamp(),updatedAt:stamp()});
  if(profile.profileComplete&&profile.username){const portfolio=db.doc('portfolioProfiles/'+user.uid);if(!(await tx.get(portfolio)).exists)tx.set(portfolio,draft(user,profile));}
 });
}
export async function registerProfessional(data){
 const user=context().user;if(!user)throw new HttpsError('unauthenticated','Sign in to create your Professional account.');
 const username=clean(data.username,24,true).toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))throw new HttpsError('invalid-argument','Use 3–24 lowercase letters, numbers, or underscores.');
 const displayName=clean(data.displayName,100,true),school=clean(data.school,160,true),city=clean(data.city,120,true),bio=clean(data.bio,1000,true);
 await db.runTransaction(async tx=>{
  const userRef=db.doc('users/'+user.uid),nameRef=db.doc('usernames/'+username),accountRef=db.doc('professionalAccounts/'+user.uid),portfolioRef=db.doc('portfolioProfiles/'+user.uid);
  const [identity,reserved,account,portfolio]=await Promise.all([tx.get(userRef),tx.get(nameRef),tx.get(accountRef),tx.get(portfolioRef)]);
  if(reserved.exists&&reserved.data().userId!==user.uid)throw new HttpsError('already-exists','That username is already taken.');
  if(identity.data()?.username&&identity.data().username!==username)throw new HttpsError('failed-precondition','Your username cannot be changed.');
  tx.set(nameRef,{userId:user.uid,username,createdAt:reserved.data()?.createdAt||stamp()});
  tx.set(userRef,{email:user.email,username,displayName,school,city,bio,photoURL:user.photoURL||'',profileComplete:true,updatedAt:stamp()},{merge:true});
  tx.set(accountRef,{ownerId:user.uid,email:user.email,username,displayName,status:'active',verified:account.data()?.verified===true,createdAt:account.data()?.createdAt||stamp(),updatedAt:stamp()},{merge:true});
  if(!portfolio.exists)tx.set(portfolioRef,draft(user,{username,displayName,city,bio}));
 });
 return {success:true,username,destination:'https://professional.aiasbsr.com/portfolio-builder.html'};
}
export async function professionalAdmin(request){
 const perms=await permissions(),write=request.method==='POST';
 if(!perms.includes('*')&&!perms.includes('manage_professional')&&!(request.method==='GET'&&perms.includes('view_professional')))throw new HttpsError(context().user?'permission-denied':'unauthenticated','Professional management permission is required.');
 if(request.method==='GET'){
  const [users,accounts,profiles,businesses]=await Promise.all(['users','professionalAccounts','portfolioProfiles','businessAccounts'].map(path=>db.collection(path).get()));
  const map=items=>new Map(items.docs.map(item=>[item.id,item.data()])),am=map(accounts),pm=map(profiles),bm=map(businesses);
  return {accounts:users.docs.filter(item=>item.data().profileComplete||am.has(item.id)||pm.has(item.id)).map(item=>{const u=item.data(),a=am.get(item.id)||{},p=pm.get(item.id)||{};return {uid:item.id,email:u.email||a.email||'',displayName:a.displayName||p.displayName||u.displayName||'',username:a.username||u.username||'',verified:a.verified===true,portfolioStatus:p.status||'not started',businessStatus:bm.get(item.id)?.status||'none',businessName:bm.get(item.id)?.businessName||''};})};
 }
 if(!write)throw new HttpsError('invalid-argument','Unsupported method.');
 const data=await request.json();const uid=clean(data.uid,128,true);if(!/^[A-Za-z0-9_-]+$/.test(uid))throw new HttpsError('invalid-argument','Invalid account.');
 const userRef=db.doc('users/'+uid),identity=await userRef.get();if(!identity.exists)throw new HttpsError('not-found','Account not found.');
 const actor=context().user.email;
 if(data.action==='verify'||data.action==='unverify'){
  await db.doc('professionalAccounts/'+uid).set({ownerId:uid,displayName:identity.data().displayName||'',username:identity.data().username||'',email:identity.data().email||'',verified:data.action==='verify',updatedAt:stamp(),updatedBy:actor},{merge:true});
 }else if(['grant_business','suspend_business','restore_business'].includes(data.action)){
  const businessName=clean(data.businessName,160);const status=data.action==='suspend_business'?'suspended':'active';
  await db.doc('businessAccounts/'+uid).set({ownerId:uid,businessProfileId:uid,...(businessName?{businessName}:{}),status,verified:status==='active',updatedAt:stamp(),updatedBy:actor},{merge:true});
 }else throw new HttpsError('invalid-argument','Choose a valid account action.');
 return {success:true};
}
