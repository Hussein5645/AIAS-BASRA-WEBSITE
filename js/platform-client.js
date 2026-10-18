import {getApp,getAuth,getFirestore,getStorage,callFunction as invoke} from './cloudflare-client.js';
export const app=getApp(),auth=getAuth(),db=getFirestore(),storage=getStorage();
const operations={checkCommunitySpaceHandle:'check_space_handle',requestMainThreadPostingAccess:'request_main_thread_access',reviewMainThreadPostingAccess:'review_main_thread_access',setCommunitySpaceVisibility:'set_space_visibility',moderateCommunitySpacePost:'moderate_space_post',warnCommunitySpaceMember:'warn_space_member'};
export const callFunction=(name,data={})=>operations[name]?invoke('setCommunitySpaceConnection',{...data,operation:operations[name]}):invoke(name,data);
