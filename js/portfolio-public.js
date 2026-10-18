import {auth,db} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  setDoc,
  deleteDoc
} from '/js/cloudflare-client.js';
import {esc,safeUrl,initials,workCard,emptyState,portfolioContentSection,portfolioBusinessSection,portfolioSidebar,bindImageFallbacks,bindWorkImageViewer,presentationClasses,applyPresentationPalette,resolveMultiThemes,profileFromThemeOption} from './portfolio-shared.js?v=20260823-task13-messaging-v1';

const root=document.getElementById('portfolioPage');
const requested=new URLSearchParams(location.search).get('id')||'';
const currentViewer=()=>new Promise(resolve=>{let unsubscribe=()=>{};unsubscribe=onAuthStateChanged(auth,viewer=>{unsubscribe();resolve(viewer)},()=>resolve(null))});

function showPublicToast(message) {
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

async function resolvePortfolio(){
  if(!requested)return null;
  const direct=await getDoc(doc(db,'portfolioProfiles',requested));
  if(direct.exists())return{id:direct.id,...direct.data()};
  const matches=await getDocs(query(collection(db,'portfolioProfiles'),where('username','==',requested),where('status','==','published')));
  return matches.empty?null:{id:matches.docs[0].id,...matches.docs[0].data()};
}

function sectionMarkup(section,works){
  if(section.visible===false||section.type==='hero')return'';
  if(section.type==='work'){const selected=Array.isArray(section.workIds)?new Set(section.workIds):null;const sectionWorks=works.filter(work=>!selected||selected.has(work.id));return `<section class="portfolio-work-section"><h2>${esc(section.title||'Selected work')}</h2>${section.content?`<div class="portfolio-rich">${esc(section.content)}</div>`:''}<div class="portfolio-work-grid">${sectionWorks.length?sectionWorks.map(workCard).join(''):emptyState('No selected work','This portfolio section does not currently include a published project.')}</div></section>`;}
  return portfolioContentSection(section);
}

try{
  const portfolio=await resolvePortfolio();
  if(!portfolio||portfolio.status!=='published')throw new Error('not-found');
  const viewer=await currentViewer();
  const isOwner=viewer?.uid===portfolio.id;

  let isConnected = false;
  let isIncomingRequest = false;
  if (viewer && !isOwner) {
    try {
      const [connSnap, followerSnap] = await Promise.all([
        getDoc(doc(db, 'users', viewer.uid, 'connections', portfolio.id)),
        getDoc(doc(db, 'users', viewer.uid, 'followers', portfolio.id)).catch(() => null)
      ]);
      isConnected = connSnap.exists();
      isIncomingRequest = !isConnected && Boolean(followerSnap?.exists());
    } catch (e) {
      console.warn('[Portfolio] Could not check connection status:', e);
    }
  }

  const [worksSnapshot, bizProfileSnap, bizPostsSnap, bizOppsSnap] = await Promise.all([
    getDocs(query(collection(db,'portfolioWorks'),where('status','==','published'),where('moderationStatus','==','clear'))),
    getDoc(doc(db, 'businessProfiles', portfolio.id)).catch(() => null),
    getDocs(query(collection(db, 'businessPosts'), where('ownerUid', '==', portfolio.id))).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, 'businessOpportunities'), where('ownerUid', '==', portfolio.id))).catch(() => ({ docs: [] }))
  ]);

  // Rules expose this published profile only while its authoritative Business
  // Account is active; the private account record is not queried by visitors.
  const isVerifiedBusiness = bizProfileSnap?.exists() && bizProfileSnap.data().status === 'published';
  const businessProfile = (isVerifiedBusiness && bizProfileSnap?.exists()) ? { id: bizProfileSnap.id, ...bizProfileSnap.data() } : null;
  const businessPosts = isVerifiedBusiness
    ? (bizPostsSnap?.docs || [])
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p.status === 'published')
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt).getTime() || 0);
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt).getTime() || 0);
          return tb - ta;
        })
    : [];
  const businessOpportunities = isVerifiedBusiness
    ? (bizOppsSnap?.docs || [])
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status === 'open')
    : [];

  const works=worksSnapshot.docs.map(document=>({id:document.id,...document.data()})).filter(work=>work.ownerId===portfolio.id);
  const displayAvatar = portfolio.avatarVisible===false ? '' : (businessProfile && safeUrl(businessProfile.logoUrl)) || safeUrl(portfolio.avatarUrl);
  const cover=safeUrl(portfolio.coverUrl);
  const sidebar=portfolioSidebar(portfolio, businessProfile);
  const multiThemes=resolveMultiThemes(portfolio);
  const primaryThemeOption=multiThemes[0];
  const initialProfile=primaryThemeOption?profileFromThemeOption(portfolio,primaryThemeOption):portfolio;

  const applyThemeStyle=(themedProfile)=>{
    const classesToRemove=Array.from(document.body.classList).filter(cls=>cls.startsWith('theme-')||cls.startsWith('surface-')||cls.startsWith('work-')||cls.startsWith('density-')||cls.startsWith('sidebar-width-')||cls.startsWith('field-backgrounds-')||cls==='theme-community');
    classesToRemove.forEach(cls=>document.body.classList.remove(cls));
    const nextClasses=presentationClasses(themedProfile).split(/\s+/).filter(Boolean);
    document.body.classList.add(...nextClasses);
    root.className=`portfolio-page ${presentationClasses(themedProfile)}`;
    applyPresentationPalette(document.documentElement,themedProfile);
  };
  applyPresentationPalette(document.documentElement,initialProfile);
  applyThemeStyle(initialProfile);
  document.documentElement.style.setProperty('--portfolio-cover',cover?`url(${JSON.stringify(cover)})`:'none');
  document.body.classList.add(cover?'has-portfolio-cover':'no-portfolio-cover');
  document.title=`${(businessProfile?.name || portfolio.displayName || 'Portfolio')} — AIAS Basra Portfolios`;
  document.querySelector('meta[name="description"]').content=portfolio.tagline||businessProfile?.shortDescription||portfolio.professionalTitle||'Professional portfolio on AIAS Basra.';

  const switcherBarMarkup=multiThemes.length>1?`
    <div class="pf-theme-switcher-bar" aria-label="Portfolio theme styles">
      <div class="pf-shell pf-theme-switcher-inner">
        <span class="pf-theme-switcher-title">🎨 <b>Theme Styles:</b></span>
        <div class="pf-theme-switcher-pills">
          ${multiThemes.map((opt,idx)=>`
            <button type="button" class="pf-theme-pill${idx===0?' active':''}" data-theme-switcher-pill="${idx}">
              <i><span style="background:${opt.accent||'#661f22'}"></span></i>
              <span>${esc(opt.name)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `:'';

  let connectActionMarkup = '';
  if (isOwner) {
    connectActionMarkup = `
      <a class="pf-button primary pf-share" href="portfolio-builder.html">Edit in Builder</a>
    `;
  } else {
    let label = '+ Connect';
    let btnClass = 'pf-button primary pf-connect-btn';
    if (isConnected) {
      label = '✓ Connected';
      btnClass = 'pf-button connected-btn pf-connect-btn';
    } else if (isIncomingRequest) {
      label = 'Accept Connection';
      btnClass = 'pf-button primary pf-connect-btn';
    }
    connectActionMarkup = `
      <button id="publicPortfolioConnectBtn" class="${btnClass}" type="button"><span>${label}</span></button>
    `;
  }

  const heroCopyMarkup = businessProfile ? `
    <div class="portfolio-copy portfolio-biz-hero-copy">
      <div class="portfolio-biz-badge-row">
        <span class="pro-verified-badge">✓ Verified Business</span>
        ${businessProfile.industry ? `<span class="portfolio-biz-industry-pill">${esc(businessProfile.industry)}</span>` : ''}
      </div>
      <div class="title">${esc(businessProfile.industry || portfolio.professionalTitle || 'Architecture Practice')}</div>
      <h1>${esc(businessProfile.name || portfolio.displayName || 'Business Portfolio')}</h1>
      <p class="portfolio-hero-location">
        ${businessProfile.location ? `<span>⌖ ${esc(businessProfile.location)}</span>` : ''}
        ${businessProfile.location && (businessProfile.shortDescription || portfolio.tagline) ? ' · ' : ''}
        ${esc(businessProfile.shortDescription || portfolio.tagline || '')}
      </p>
    </div>
  ` : `
    <div class="portfolio-copy">
      <div class="title">${esc(portfolio.professionalTitle||'Professional portfolio')}</div>
      <h1>${esc(portfolio.displayName||'Portfolio')}</h1>
      ${portfolio.tagline?`<p>${esc(portfolio.tagline)}</p>`:''}
    </div>
  `;

  let messageActionMarkup = '';
  if (!isOwner) {
    if (!businessProfile) {
      messageActionMarkup = `<a class="pf-button secondary" href="/community.html?view=messages&to=${encodeURIComponent(portfolio.id)}">Message 💬</a>`;
    } else if (viewer) {
      const dmSlug = `dm-${[viewer.uid, portfolio.id].sort().join('-')}`;
      const dmSnap = await getDoc(doc(db, 'communitySpaces', dmSlug)).catch(() => null);
      if (dmSnap?.exists()) {
        messageActionMarkup = `<a class="pf-button secondary" href="/community.html?view=messages&area=${encodeURIComponent(dmSlug)}">Message 💬</a>`;
      }
    }
  }

  const businessSectionHtml = businessProfile ? portfolioBusinessSection(businessProfile, businessPosts, businessOpportunities) : '';
  const portfolioSectionsHtml = (portfolio.sections||[]).map(section=>sectionMarkup(section,works)).join('');

  root.innerHTML=`${switcherBarMarkup}<section class="portfolio-hero">${cover?`<div class="portfolio-banner-art" aria-hidden="true"><span>${esc(portfolio.professionalTitle||'Selected practice')}</span></div>`:''}<div class="pf-shell portfolio-identity${portfolio.avatarVisible===false?' no-avatar':''}">${portfolio.avatarVisible===false?'':`<div class="portfolio-avatar">${displayAvatar?`<img src="${esc(displayAvatar)}" alt="${esc(businessProfile?.name || portfolio.displayName)}">`:esc(initials(businessProfile?.name || portfolio.displayName))}</div>`}${heroCopyMarkup}<div class="portfolio-actions">${connectActionMarkup}${messageActionMarkup}<button class="pf-button secondary pf-share" data-share-portfolio>Share to Community</button>${isOwner?'<button class="pf-button secondary pf-share" data-export-pdf>Export PDF</button>':'<button class="pf-button secondary pf-share" data-view-pdf>View PDF</button>'}<a class="pf-button secondary" href="/community.html?user=${encodeURIComponent(portfolio.username||portfolio.id)}">Community profile</a></div></div></section><div class="pf-shell portfolio-layout${sidebar?'':' no-sidebar'}"><div class="portfolio-main">${businessSectionHtml}${portfolioSectionsHtml}</div>${sidebar}</div>`;
  bindImageFallbacks(root);
  bindWorkImageViewer(root, { gallery: businessProfile?.gallery || [] });

  // Connect button event listener
  const connectBtn = document.getElementById('publicPortfolioConnectBtn');
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
            postTitle: 'Community connection',
            detailId: targetId,
            read: false,
            createdAt: serverTimestamp()
          });
        } else {
          await deleteDoc(notifRef).catch(() => {});
        }

        isConnected = willConnect;
        isIncomingRequest = false;

        connectBtn.className = `pf-button ${isConnected ? 'connected-btn' : 'primary'} pf-connect-btn`;
        connectBtn.innerHTML = `<span>${isConnected ? '✓ Connected' : '+ Connect'}</span>`;
        connectBtn.disabled = false;
        showPublicToast(isConnected ? `Connected with ${portfolio.displayName || 'Member'}` : `Disconnected from ${portfolio.displayName || 'Member'}`);
      } catch (err) {
        console.error('[Portfolio] Connection error:', err);
        connectBtn.disabled = false;
        showPublicToast('Could not update connection. Please try again.');
      }
    });
  }

  if(multiThemes.length>1){
    const nav=document.querySelector('.pf-nav');
    if(nav&&!document.getElementById('headerThemeSelector')){
      const headerSelector=document.createElement('div');
      headerSelector.id='headerThemeSelector';
      headerSelector.className='pf-header-theme-selector';
      headerSelector.innerHTML=`
        <label for="headerThemeDropdown" class="pf-header-theme-label"><span>🎨 Style:</span></label>
        <select id="headerThemeDropdown" class="pf-header-theme-select" aria-label="Switch theme style">
          ${multiThemes.map((opt,idx)=>`<option value="${idx}">${esc(opt.name)}</option>`).join('')}
        </select>
      `;
      nav.prepend(headerSelector);

      const dropdown=headerSelector.querySelector('#headerThemeDropdown');
      dropdown.addEventListener('change',()=>{
        const idx=Number(dropdown.value);
        const chosenOption=multiThemes[idx];
        const themedProfile=profileFromThemeOption(portfolio,chosenOption);
        applyThemeStyle(themedProfile);
        root.querySelectorAll('[data-theme-switcher-pill]').forEach((b,i)=>b.classList.toggle('active',i===idx));
      });
    }

    root.querySelectorAll('[data-theme-switcher-pill]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const idx=Number(btn.dataset.themeSwitcherPill);
        const chosenOption=multiThemes[idx];
        const themedProfile=profileFromThemeOption(portfolio,chosenOption);
        applyThemeStyle(themedProfile);
        root.querySelectorAll('[data-theme-switcher-pill]').forEach((b,i)=>b.classList.toggle('active',i===idx));
        const dropdown=document.getElementById('headerThemeDropdown');
        if(dropdown)dropdown.value=String(idx);
      });
    });
  }

  root.querySelector('[data-share-portfolio]').addEventListener('click',()=>location.assign(`/community.html?view=post&portfolioKind=portfolio&portfolioId=${encodeURIComponent(portfolio.id)}`));
  root.querySelector('[data-export-pdf]')?.addEventListener('click',()=>{if(auth.currentUser?.uid===portfolio.id)window.open(`portfolio-pdf.html?id=${encodeURIComponent(portfolio.id)}&print=1`,'_blank','noopener')});
  root.querySelector('[data-view-pdf]')?.addEventListener('click',()=>window.open(`portfolio-pdf.html?id=${encodeURIComponent(portfolio.id)}`,'_blank','noopener'));

  // Opportunity viewer dialog binding
  root.addEventListener('click', event => {
    const oppBtn = event.target.closest('[data-view-opportunity]');
    if (!oppBtn) return;
    const oppId = oppBtn.dataset.viewOpportunity;
    const opp = businessOpportunities.find(o => o.id === oppId);
    if (!opp) return;

    let dialog = document.getElementById('proOpportunityDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'proOpportunityDialog';
      dialog.className = 'pro-opportunity-modal';
      document.body.appendChild(dialog);
    }

    const isJob = opp.type === 'job';
    const skills = Array.isArray(opp.skills) ? opp.skills : [];
    const software = Array.isArray(opp.software) ? opp.software : [];

    dialog.innerHTML = `
      <div class="pro-opportunity-modal-inner">
        <div class="pro-opportunity-modal-header">
          <div>
            <span class="pro-job-type-badge ${isJob ? 'job' : 'internship'}">${isJob ? '💼 Job Opening' : '🎓 Internship Program'}</span>
            <h3 style="margin:6px 0 2px;font-size:1.35rem;font-weight:850;color:var(--ink);">${esc(opp.title)}</h3>
            <span style="font-size:0.88rem;color:var(--wine);font-weight:800;">${esc(opp.businessName || 'Architecture Studio')} ✓</span>
          </div>
          <button type="button" class="pro-opportunity-modal-close" aria-label="Close dialog">×</button>
        </div>

        <div class="pro-job-pill-row" style="margin-bottom:16px;">
          <span class="pro-job-pill">⌖ ${esc(opp.location || 'Basra')}</span>
          ${isJob ? `<span class="pro-job-pill">${esc(opp.employmentType || 'Full-time')}</span><span class="pro-job-pill">${esc(opp.workplaceType || 'On-site')}</span><span class="pro-job-pill">Exp: ${esc(opp.experience || 'Entry')}</span>` : `<span class="pro-job-pill">⏱ ${esc(opp.duration || '3 Months')}</span><span class="pro-job-pill">${esc(opp.compensation || 'Paid')}</span>`}
          ${opp.compensation && isJob ? `<span class="pro-job-pill" style="background:#ecfdf5;color:#047857;">💰 ${esc(opp.compensation)}</span>` : ''}
          ${opp.deadline ? `<span class="pro-job-pill" style="background:#fff1f2;color:#be123c;">⏳ Deadline: ${esc(opp.deadline)}</span>` : ''}
        </div>

        <div style="font-size:0.9rem;line-height:1.6;color:var(--ink);margin-bottom:20px;white-space:pre-line;">${esc(opp.description || '')}</div>

        ${skills.length ? `<div style="margin-bottom:14px;"><strong style="display:block;font-size:0.8rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Required Capabilities:</strong><div class="pro-job-chips-group">${skills.map(s => `<span class="pro-job-chip">${esc(s)}</span>`).join('')}</div></div>` : ''}
        ${software.length ? `<div style="margin-bottom:14px;"><strong style="display:block;font-size:0.8rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Required Software:</strong><div class="pro-job-chips-group">${software.map(s => `<span class="pro-job-chip software">${esc(s)}</span>`).join('')}</div></div>` : ''}
        ${opp.studentRequirements ? `<div style="margin-bottom:14px;padding:12px;border-radius:10px;background:#fdf4ff;border:1px solid #f5d0fe;font-size:0.84rem;color:#701a75;"><strong>Student Requirements:</strong> ${esc(opp.studentRequirements)}</div>` : ''}

        <div style="margin-top:24px;padding:16px;border-radius:14px;background:#f7f3ee;border:1px solid var(--line);text-align:center;">
          <strong style="display:block;font-size:0.9rem;color:var(--ink);margin-bottom:4px;">✦ Portfolio-Based Application Process</strong>
          <p style="margin:0 0 10px;font-size:0.8rem;color:var(--muted);">Apply directly with your verified BASRA Professional.</p>
          <a class="pf-button primary" href="portfolios.html?tab=${isJob ? 'jobs' : 'internships'}" style="display:inline-flex;">View Opportunity in Discovery →</a>
        </div>
      </div>
    `;

    dialog.querySelector('.pro-opportunity-modal-close').addEventListener('click', () => dialog.close());
    dialog.showModal();
  });
}catch(error){
  console.error(error);
  root.innerHTML=`<section class="pf-shell" style="padding-top:40px">${emptyState('Portfolio not available','It may be private, unpublished, or the link may be incorrect.')}</section>`;
}
