import {auth, db} from './platform-client.js';
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
import {esc, safeUrl, initials, workCard, emptyState} from './portfolio-shared.js';

const root = document.getElementById('businessPage');
const requestedId = new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('u') || '';

function showToast(message) {
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

const currentViewer = () => new Promise(resolve => {
  let unsubscribe = () => {};
  unsubscribe = onAuthStateChanged(auth, viewer => {
    unsubscribe();
    resolve(viewer);
  }, () => resolve(null));
});

async function resolveBusiness() {
  if (!requestedId) return null;
  // Try direct lookup by UID
  const direct = await getDoc(doc(db, 'businessProfiles', requestedId));
  if (direct.exists()) return { id: direct.id, ...direct.data() };

  // Try lookup by professional username
  const matches = await getDocs(query(collection(db, 'businessProfiles'), where('username', '==', requestedId.toLowerCase())));
  if (!matches.empty) {
    return { id: matches.docs[0].id, ...matches.docs[0].data() };
  }
  return null;
}

async function init() {
  try {
    const business = await resolveBusiness();
    if (!business) throw new Error('not-found');

    const viewer = await currentViewer();
    const isOwner = viewer?.uid === business.id;
    // Firestore rules expose published profiles only when the authoritative
    // Business Account is active. Owners may still preview their own drafts.
    if (business.status !== 'published' && !isOwner) throw new Error('not-active');

    // Check viewer connection state
    let isConnected = false;
    if (viewer && !isOwner) {
      try {
        const connSnap = await getDoc(doc(db, 'users', viewer.uid, 'connections', business.id));
        isConnected = connSnap.exists();
      } catch (e) {
        console.warn('[Business] Connection check failed:', e);
      }
    }

    // Load projects published by this business
    const worksSnap = await getDocs(query(
      collection(db, 'portfolioWorks'),
      where('status', '==', 'published'),
      where('moderationStatus', '==', 'clear')
    ));
    const projects = worksSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(w => w.ownerId === business.id);

    // Load community posts authored by this business
    const postsSnap = await getDocs(query(
      collection(db, 'businessPosts'),
      where('ownerUid', '==', business.id),
      where('status', '==', 'published')
    ));
    const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const logo = safeUrl(business.logoUrl);
    const cover = safeUrl(business.coverUrl);
    const services = Array.isArray(business.services) ? business.services : [];
    const specializations = Array.isArray(business.specializations) ? business.specializations : [];
    const socialLinks = Array.isArray(business.socialLinks) ? business.socialLinks : [];
    const gallery = Array.isArray(business.gallery) ? business.gallery.map(safeUrl).filter(Boolean) : [];

    document.title = `${business.name} — AIAS Basra Business Profile`;

    let actionsMarkup = '';
    if (isOwner) {
      actionsMarkup = `
        <a class="pf-button primary" href="business-builder.html">Edit Business Profile</a>
        <button class="pf-button secondary pf-share" data-share-biz>Share Profile</button>
      `;
    } else {
      actionsMarkup = `
        <button id="bizConnectBtn" class="pf-button ${isConnected ? 'connected-btn' : 'primary'} pf-connect-btn" type="button">
          <span>${isConnected ? '✓ Connected' : '+ Connect'}</span>
        </button>
        <a class="pf-button secondary" href="/community.html?view=messages&to=${encodeURIComponent(business.id)}">Message</a>
        <button class="pf-button secondary pf-share" data-share-biz>Share</button>
      `;
    }

    root.innerHTML = `
      <section class="portfolio-hero pro-biz-hero">
        ${cover ? `<div class="portfolio-banner-art pro-biz-cover" style="background-image:url(${JSON.stringify(cover)})" aria-hidden="true"></div>` : ''}
        <div class="pf-shell portfolio-identity pro-biz-identity">
          <div class="portfolio-avatar pro-biz-logo">
            ${logo ? `<img src="${esc(logo)}" alt="${esc(business.name)}" loading="lazy">` : `<span>${esc(initials(business.name))}</span>`}
          </div>
          <div class="portfolio-copy pro-biz-copy">
            <div class="pro-biz-meta-badge">
              <span class="pro-biz-industry">${esc(business.industry || 'Architecture Practice')}</span>
              ${isVerifiedActive ? `<span class="pro-verified-badge" title="Master Admin Verified Business">✓ Verified Practice</span>` : ''}
            </div>
            <h1>${esc(business.name)}</h1>
            ${business.shortDescription ? `<p class="pro-biz-tagline">${esc(business.shortDescription)}</p>` : ''}
            <div class="pro-biz-quick-info">
              ${business.location ? `<span>⌖ ${esc(business.location)}</span>` : ''}
              ${business.companySize ? `<span>👥 ${esc(business.companySize)}</span>` : ''}
              ${business.website ? `<span><a href="${esc(safeUrl(business.website))}" target="_blank" rel="noopener">🌐 Website ↗</a></span>` : ''}
            </div>
          </div>
          <div class="portfolio-actions pro-biz-actions">
            ${actionsMarkup}
          </div>
        </div>
      </section>

      <!-- Business Sub-Navigation -->
      <div class="pro-biz-nav-bar">
        <div class="pf-shell pro-biz-nav-inner">
          <button type="button" class="pro-biz-tab-btn active" data-biz-tab="overview">Overview</button>
          <button type="button" class="pro-biz-tab-btn" data-biz-tab="projects">Projects <small>(${projects.length})</small></button>
          <button type="button" class="pro-biz-tab-btn" data-biz-tab="posts">Posts <small>(${posts.length})</small></button>
          <button type="button" class="pro-biz-tab-btn" data-biz-tab="jobs">Jobs <span class="pro-tab-pill">Upcoming</span></button>
          <button type="button" class="pro-biz-tab-btn" data-biz-tab="internships">Internships <span class="pro-tab-pill">Upcoming</span></button>
        </div>
      </div>

      <div class="pf-shell pro-biz-content-area">
        <!-- 1. OVERVIEW PANEL -->
        <div id="biz-panel-overview" class="pro-biz-panel active">
          <div class="pro-biz-layout">
            <div class="pro-biz-main-col">
              ${business.about ? `
                <section class="pro-biz-section">
                  <h2>About the Practice</h2>
                  <div class="pro-biz-rich-text">${esc(business.about).replace(/\n/g, '<br>')}</div>
                </section>
              ` : ''}

              ${services.length ? `
                <section class="pro-biz-section">
                  <h2>Services Offered</h2>
                  <div class="pro-tag-chips">
                    ${services.map(s => `<span class="pro-tag-chip">✦ ${esc(s)}</span>`).join('')}
                  </div>
                </section>
              ` : ''}

              ${specializations.length ? `
                <section class="pro-biz-section">
                  <h2>Specializations & Typologies</h2>
                  <div class="pro-tag-chips">
                    ${specializations.map(s => `<span class="pro-tag-chip secondary">${esc(s)}</span>`).join('')}
                  </div>
                </section>
              ` : ''}

              ${gallery.length ? `
                <section class="pro-biz-section">
                  <h2>Studio & Practice Gallery</h2>
                  <div class="pro-biz-gallery-grid">
                    ${gallery.map(img => `<div class="pro-biz-gallery-item"><img src="${esc(img)}" alt="Studio gallery" loading="lazy"></div>`).join('')}
                  </div>
                </section>
              ` : ''}
            </div>

            <!-- Sidebar Details -->
            <aside class="pro-biz-side-col">
              <div class="pro-biz-side-card">
                <h3>Contact & Studio Info</h3>
                <div class="pro-biz-contact-list">
                  ${business.contactEmail ? `
                    <div class="pro-biz-contact-item">
                      <small>Email</small>
                      <a href="mailto:${esc(business.contactEmail)}">${esc(business.contactEmail)}</a>
                    </div>
                  ` : ''}
                  ${business.contactPhone ? `
                    <div class="pro-biz-contact-item">
                      <small>Phone</small>
                      <a href="tel:${esc(business.contactPhone)}">${esc(business.contactPhone)}</a>
                    </div>
                  ` : ''}
                  ${business.address ? `
                    <div class="pro-biz-contact-item">
                      <small>Office Address</small>
                      <span>${esc(business.address)}</span>
                    </div>
                  ` : ''}
                  ${business.website ? `
                    <div class="pro-biz-contact-item">
                      <small>Official Website</small>
                      <a href="${esc(safeUrl(business.website))}" target="_blank" rel="noopener">${esc(business.website)} ↗</a>
                    </div>
                  ` : ''}
                </div>

                ${socialLinks.length ? `
                  <h4 style="margin:16px 0 8px;font-size:0.78rem;text-transform:uppercase;color:var(--muted)">Social & Channels</h4>
                  <div class="pro-biz-socials">
                    ${socialLinks.map(link => `<a class="pro-biz-social-btn" href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener">${esc(link.platform)} ↗</a>`).join('')}
                  </div>
                ` : ''}
              </div>
            </aside>
          </div>
        </div>

        <!-- 2. PROJECTS PANEL -->
        <div id="biz-panel-projects" class="pro-biz-panel" hidden>
          <div class="pf-grid pro-work-grid">
            ${projects.length ? projects.map(workCard).join('') : emptyState('No published projects yet', 'This practice has not published any project case studies yet.')}
          </div>
        </div>

        <!-- 3. POSTS PANEL -->
        <div id="biz-panel-posts" class="pro-biz-panel" hidden>
          <div class="pro-biz-posts-list">
            ${posts.length ? posts.map(post => `
              <article class="pro-biz-post-card">
                <h3>${esc(post.title || 'Studio update')}</h3>
                <p>${esc(post.summary || post.text || post.content || '').slice(0, 180)}…</p>

              </article>
            `).join('') : emptyState('No studio updates', 'This business account has not published any studio updates yet.')}
          </div>
        </div>

        <!-- 4. JOBS PANEL (Placeholder Module) -->
        <div id="biz-panel-jobs" class="pro-biz-panel" hidden>
          <div class="pro-placeholder-card">
            <div class="pro-placeholder-icon">💼</div>
            <h3>Studio Openings & Opportunities</h3>
            <p>Job listings published by ${esc(business.name)} will appear here once opportunity management is released in the upcoming stage.</p>
          </div>
        </div>

        <!-- 5. INTERNSHIPS PANEL (Placeholder Module) -->
        <div id="biz-panel-internships" class="pro-biz-panel" hidden>
          <div class="pro-placeholder-card">
            <div class="pro-placeholder-icon">🎓</div>
            <h3>Internships & Mentorship</h3>
            <p>Internship and training placements published by ${esc(business.name)} will appear here.</p>
          </div>
        </div>
      </div>
    `;

    // Bind sub-tabs
    root.querySelectorAll('[data-biz-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.bizTab;
        root.querySelectorAll('.pro-biz-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.bizTab === tabId));
        root.querySelectorAll('.pro-biz-panel').forEach(panel => {
          const isTarget = panel.id === `biz-panel-${tabId}`;
          panel.classList.toggle('active', isTarget);
          panel.hidden = !isTarget;
        });
      });
    });

    // Share button
    root.querySelector('[data-share-biz]')?.addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
        showToast('Business profile link copied to clipboard!');
      }
    });

    // Connect Button
    const connectBtn = document.getElementById('bizConnectBtn');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        if (!auth.currentUser) {
          window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
          return;
        }
        const currentUid = auth.currentUser.uid;
        const targetId = business.id;
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
          showToast(isConnected ? `Connected with ${business.name}` : `Disconnected from ${business.name}`);
        } catch (err) {
          console.error('[Business] Connection failed:', err);
          connectBtn.disabled = false;
          showToast('Could not update connection. Please try again.');
        }
      });
    }
  } catch (error) {
    console.error('[Business] Load failed:', error);
    root.innerHTML = `
      <section class="pf-shell" style="padding-top: 40px;">
        ${emptyState('Business Profile Not Available', 'This practice profile may be unpublished, restricted, or the link is incorrect.')}
      </section>
    `;
  }
}

init();
