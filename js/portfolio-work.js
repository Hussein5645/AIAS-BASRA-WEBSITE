import {auth,db} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  setDoc,
  deleteDoc
} from '/js/cloudflare-client.js';
import {esc,emptyState,applyPresentationPalette,workPresentation,workPageClass,workPageMarkup,bindWorkImageViewer} from './portfolio-shared.js?v=20260821-full-theme-editor-v1';

const root=document.getElementById('workPage');
const id=new URLSearchParams(location.search).get('id')||'';
const currentViewer=()=>new Promise(resolve=>{let unsubscribe=()=>{};unsubscribe=onAuthStateChanged(auth,viewer=>{unsubscribe();resolve(viewer)},()=>resolve(null))});

function showWorkToast(message) {
  let toast = document.getElementById('proToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'proToast';
    toast.className = 'pro-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

try{
  const workSnap=await getDoc(doc(db,'portfolioWorks',id));
  if(!workSnap.exists()||workSnap.data().status!=='published'||workSnap.data().moderationStatus==='flagged')throw new Error('not-found');
  const work={id:workSnap.id,...workSnap.data()};
  const portfolioSnap=await getDoc(doc(db,'portfolioProfiles',work.ownerId));
  if(!portfolioSnap.exists()||portfolioSnap.data().status!=='published')throw new Error('portfolio-not-found');
  const portfolio={id:portfolioSnap.id,...portfolioSnap.data()};
  const presentation=workPresentation(work,portfolio);

  const viewer = await currentViewer();
  const isOwner = viewer?.uid === portfolio.id;
  let isConnected = false;

  if (viewer && !isOwner) {
    try {
      const connSnap = await getDoc(doc(db, 'users', viewer.uid, 'connections', portfolio.id));
      isConnected = connSnap.exists();
    } catch (e) {
      console.warn('[WorkPage] Could not check connection status:', e);
    }
  }

  applyPresentationPalette(document.documentElement,presentation);
  document.body.className=workPageClass(work,portfolio);
  document.title=`${work.title} — ${portfolio.displayName}`;
  document.querySelector('meta[name="description"]').content=work.summary||'Professional work on AIAS Basra Portfolios.';

  let connectBtnMarkup = '';
  if (!isOwner) {
    connectBtnMarkup = `<button id="workAuthorConnectBtn" class="pf-button ${isConnected ? 'connected-btn' : 'primary'} pf-connect-btn" type="button"><span>${isConnected ? '✓ Connected' : '+ Connect'}</span></button>`;
  }

  root.innerHTML=workPageMarkup(work,portfolio,{actions:`<div class="pf-hero-actions"><a class="pf-button secondary" href="portfolio.html?id=${encodeURIComponent(portfolio.id)}">View portfolio</a>${connectBtnMarkup}<button class="pf-button secondary pf-share" data-share-work>Share to Professional</button></div>`});
  bindWorkImageViewer(root,work);

  const connectBtn = document.getElementById('workAuthorConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      if (!auth.currentUser) {
        window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
        return;
      }
      const currentUid = auth.currentUser.uid;
      const targetId = portfolio.id;
      const willConnect = !isConnected;
      connectBtn.disabled = true;

      try {
        const batch = writeBatch(db);
        const connectionRef = doc(db, 'users', currentUid, 'connections', targetId);
        const followerRef = doc(db, 'users', targetId, 'followers', currentUid);

        if (willConnect) {
          const record = {userId: currentUid, targetUserId: targetId, createdAt: serverTimestamp()};
          batch.set(connectionRef, record);
          batch.set(followerRef, record);
        } else {
          batch.delete(connectionRef);
          batch.delete(followerRef);
        }

        await batch.commit();

        const notifRef = doc(db, 'users', targetId, 'notifications', `connection_${targetId}_${currentUid}`);
        if (willConnect) {
          await setDoc(notifRef, {
            recipientId: targetId,
            actorId: currentUid,
            actorName: auth.currentUser.displayName || 'Member',
            actorUsername: '',
            type: 'connection',
            postId: '',
            postTitle: 'Professional connection',
            detailId: targetId,
            read: false,
            createdAt: serverTimestamp()
          });
        } else {
          await deleteDoc(notifRef).catch(() => {});
        }

        isConnected = willConnect;
        connectBtn.className = `pf-button ${isConnected ? 'connected-btn' : 'primary'} pf-connect-btn`;
        connectBtn.innerHTML = `<span>${isConnected ? '✓ Connected' : '+ Connect'}</span>`;
        connectBtn.disabled = false;
        showWorkToast(isConnected ? `Connected with ${portfolio.displayName || 'Author'}` : `Disconnected from ${portfolio.displayName || 'Author'}`);
      } catch (err) {
        console.error('[WorkPage] Connection error:', err);
        connectBtn.disabled = false;
        showWorkToast('Could not update connection. Please try again.');
      }
    });
  }

  root.querySelector('[data-share-work]').addEventListener('click',()=>location.assign(`/community.html?view=post&portfolioKind=work&portfolioId=${encodeURIComponent(work.id)}`));
}catch(error){
  console.error(error);
  root.innerHTML=`<section class="pf-shell" style="padding-top:40px">${emptyState('Work not available','It may be private, unpublished, or the link may be incorrect.')}</section>`;
}
