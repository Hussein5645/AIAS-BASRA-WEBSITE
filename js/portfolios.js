import {auth, db, callFunction} from './platform-client.js';
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
import {portfolioCard, workCard, emptyState, time, esc, safeUrl, initials} from './portfolio-shared.js';

function friendlyError(error, fallback = 'An error occurred.') {
  if (!error) return fallback;
  return error.message || error.details || String(error) || fallback;
}

const DEFAULT_TAGS = [
  {id:'design', en:'Design', ar:'التصميم'},
  {id:'technology', en:'Technology', ar:'التكنولوجيا'},
  {id:'engineering', en:'Engineering', ar:'الهندسة'},
  {id:'research', en:'Research', ar:'البحث'},
  {id:'art_media', en:'Art & media', ar:'الفن والإعلام'},
  {id:'business', en:'Business', ar:'الأعمال'},
  {id:'other', en:'Other', ar:'أخرى'}
];

const TAB_METADATA = {
  home: {
    title: 'Professional Space',
    subtitle: 'Discover architectural practice, published projects, and creative perspectives.',
    showChips: true
  },
  work: {
    title: 'Published Work',
    subtitle: 'Explore architectural projects, case studies, and design explorations.',
    showChips: true
  },
  people: {
    title: 'Professional Portfolios',
    subtitle: 'Connect with practitioners, architects, and designers across the community.',
    showChips: true
  },
  businesses: {
    title: 'Practices & Businesses',
    subtitle: 'Directory of verified architecture studios, design firms, and organizations.',
    showChips: false
  },
  jobs: {
    title: 'Opportunities & Studio Roles',
    subtitle: 'Job openings, project collaborations, and design positions.',
    showChips: false
  },
  internships: {
    title: 'Internships & Training',
    subtitle: 'Student internships, academic workshops, and graduate apprentice programs.',
    showChips: false
  },
  connections: {
    title: 'Your Professional Connections',
    subtitle: 'Verified practitioners and colleagues in your Space professional network.',
    showChips: false
  },
  saved: {
    title: 'Saved Items & Bookmarks',
    subtitle: 'Your bookmarked projects, portfolios, and opportunities.',
    showChips: false
  }
};

const state = {
  activeTab: 'home',
  category: 'all',
  searchQuery: '',
  peopleLocation: 'all',
  peopleSkill: 'all',
  peopleSort: 'recent',
  businessLocation: 'all',
  businessIndustry: 'all',
  businessSpecialization: 'all',
  jobLocation: 'all',
  jobType: 'all',
  jobWorkplace: 'all',
  jobExperience: 'all',
  internshipLocation: 'all',
  internshipDuration: 'all',
  internshipCompensation: 'all',
  jobs: [],
  internships: [],
  savedOppIds: new Set(JSON.parse(localStorage.getItem('pro_saved_opps') || '[]')),
  myApplications: new Map(),
  userWorks: [],
  tags: [],
  profiles: [],
  works: [],
  businesses: [],
  currentUser: null,
  userProfileData: null,
  userPortfolio: null,
  userBusinessAccount: null,
  userBusinessProfile: null,
  connectedUserIds: new Set(),
  connectedProfiles: []
};

const $ = id => document.getElementById(id);

function getLang() {
  return document.documentElement.lang === 'ar' || localStorage.getItem('language') === 'ar' ? 'ar' : 'en';
}

function showToast(message) {
  let toast = $('proToast');
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

function categoryMatches(item) {
  if (state.category === 'all') return true;
  const tag = state.tags.find(candidate => candidate.id === state.category);
  if (!tag) return true;
  const haystack = [
    item.professionalTitle,
    item.tagline,
    item.workType,
    item.industry,
    ...(item.skills || []),
    ...(item.services || []),
    ...(item.tags || [])
  ].join(' ').toLowerCase();
  return [tag.en, tag.ar].filter(Boolean).some(term => haystack.includes(String(term).toLowerCase()));
}

function itemSearchMatches(item, query) {
  if (!query) return true;
  const haystack = [
    item.displayName,
    item.name,
    item.professionalTitle,
    item.tagline,
    item.shortDescription,
    item.about,
    item.industry,
    item.title,
    item.summary,
    item.workType,
    item.ownerName,
    item.location,
    ...(item.skills || []),
    ...(item.services || []),
    ...(item.specializations || []),
    ...(item.tags || [])
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function computeProjectCounts() {
  const counts = new Map();
  state.works.forEach(w => {
    if (w.ownerId) {
      counts.set(w.ownerId, (counts.get(w.ownerId) || 0) + 1);
    }
  });
  state.profiles.forEach(p => {
    p.projectCount = counts.get(p.id) || 0;
  });
  state.businesses.forEach(b => {
    b.projectCount = counts.get(b.id) || 0;
  });
}

function renderIdentityCard() {
  const container = $('proIdentityCard');
  if (!container) return;

  const hasBusiness = state.userBusinessAccount?.status === 'active';

  if (state.currentUser && state.userPortfolio) {
    const p = state.userPortfolio;
    const avatar = safeUrl(p.avatarUrl || p.coverUrl);
    const skills = (Array.isArray(p.skills) ? p.skills : []).slice(0, 3);
    const title = p.professionalTitle || p.tagline || 'Professional Practitioner';
    const loc = p.location || 'AIAS Basra';

    container.innerHTML = `
      <div class="pro-profile-summary">
        <a class="pro-profile-avatar" href="portfolio.html?id=${encodeURIComponent(p.id)}">
          ${avatar ? `<img src="${esc(avatar)}" alt="${esc(p.displayName || 'Portfolio')}" loading="lazy">` : `<span>${esc(initials(p.displayName || 'PF'))}</span>`}
        </a>
        <div class="pro-profile-meta">
          <h3><a href="portfolio.html?id=${encodeURIComponent(p.id)}">${esc(p.displayName || 'My Portfolio')}</a></h3>
          <p class="pro-profile-title">${esc(title)}</p>
          <p class="pro-profile-loc"><span>⌖</span> ${esc(loc)}</p>
        </div>
      </div>
      ${skills.length ? `<div class="pro-profile-skills">${skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="pro-profile-actions">
        <a class="pf-button secondary btn-sm" href="portfolio.html?id=${encodeURIComponent(p.id)}">View Public Portfolio</a>
        <a class="pf-button text-btn btn-sm" href="portfolio-builder.html">Edit in Builder →</a>
      </div>
      ${hasBusiness ? `
        <div class="pro-biz-user-badge">
          <span>🏛️ Verified Business</span>
          <a class="pf-button text-btn btn-sm" href="business-builder.html">Manage Studio Profile →</a>
        </div>
      ` : ''}
    `;
  } else if (state.currentUser && hasBusiness) {
    container.innerHTML = `
      <div class="pro-presence-cta">
        <div class="pro-presence-badge">🏛️ Verified Business</div>
        <h3>Manage Your Studio Profile</h3>
        <p>Your Professional account has verified Business Status. Manage and publish your studio profile.</p>
        <a class="pf-button primary w-full" href="business-builder.html">Open Business Builder</a>
      </div>
    `;
  } else {
    // If user has no portfolio or is not logged in:
    const builderHref = state.currentUser ? 'portfolio-builder.html' : 'login.html?next=portfolio-builder.html';
    container.innerHTML = `
      <div class="pro-presence-cta">
        <div class="pro-presence-badge">✦ Professional Presence</div>
        <h3>Build Your Professional Presence</h3>
        <p>Create a Portfolio to appear in BASRA Professional, connect with professionals, and apply for opportunities.</p>
        <a class="pf-button primary w-full" href="${builderHref}">Create Portfolio</a>
      </div>
    `;
  }
}

function renderTags() {
  const container = $('proCategoryChips');
  if (!container) return;
  const lang = getLang();
  container.replaceChildren();

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `pf-chip${state.category === 'all' ? ' active' : ''}`;
  allBtn.dataset.category = 'all';
  allBtn.textContent = lang === 'ar' ? 'كل التخصصات' : 'All professions';
  container.append(allBtn);

  state.tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pf-chip${state.category === tag.id ? ' active' : ''}`;
    btn.dataset.category = tag.id;
    btn.textContent = lang === 'ar' ? (tag.ar || tag.en) : tag.en;
    container.append(btn);
  });
}

function populatePeopleFilters() {
  const locationSelect = $('peopleLocationFilter');
  const skillSelect = $('peopleSkillFilter');

  if (locationSelect) {
    const locations = [...new Set(state.profiles.map(p => (p.location || '').trim()).filter(Boolean))].sort();
    locationSelect.innerHTML = '<option value="all">All Locations</option>' +
      locations.map(loc => `<option value="${esc(loc.toLowerCase())}"${state.peopleLocation === loc.toLowerCase() ? ' selected' : ''}>${esc(loc)}</option>`).join('');
  }

  if (skillSelect) {
    const skillCounts = new Map();
    state.profiles.forEach(p => {
      (Array.isArray(p.skills) ? p.skills : []).forEach(s => {
        const trimmed = (s || '').trim();
        if (trimmed) {
          skillCounts.set(trimmed, (skillCounts.get(trimmed) || 0) + 1);
        }
      });
    });

    const topSkills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(entry => entry[0]);
    skillSelect.innerHTML = '<option value="all">All Skills</option>' +
      topSkills.map(skill => `<option value="${esc(skill.toLowerCase())}"${state.peopleSkill === skill.toLowerCase() ? ' selected' : ''}>${esc(skill)} (${skillCounts.get(skill)})</option>`).join('');
  }
}

function populateBusinessFilters() {
  const locationSelect = $('businessLocationFilter');
  const industrySelect = $('businessIndustryFilter');
  const specSelect = $('businessSpecializationFilter');

  if (locationSelect) {
    const locations = [...new Set(state.businesses.map(b => (b.location || '').trim()).filter(Boolean))].sort();
    locationSelect.innerHTML = '<option value="all">All Locations</option>' +
      locations.map(loc => `<option value="${esc(loc.toLowerCase())}"${state.businessLocation === loc.toLowerCase() ? ' selected' : ''}>${esc(loc)}</option>`).join('');
  }

  if (industrySelect) {
    const industries = [...new Set(state.businesses.map(b => (b.industry || '').trim()).filter(Boolean))].sort();
    industrySelect.innerHTML = '<option value="all">All Industries</option>' +
      industries.map(ind => `<option value="${esc(ind.toLowerCase())}"${state.businessIndustry === ind.toLowerCase() ? ' selected' : ''}>${esc(ind)}</option>`).join('');
  }

  if (specSelect) {
    const specCounts = new Map();
    state.businesses.forEach(b => {
      [
        ...(Array.isArray(b.services) ? b.services : []),
        ...(Array.isArray(b.specializations) ? b.specializations : [])
      ].forEach(s => {
        const trimmed = (s || '').trim();
        if (trimmed) {
          specCounts.set(trimmed, (specCounts.get(trimmed) || 0) + 1);
        }
      });
    });

    const topSpecs = [...specCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(entry => entry[0]);
    specSelect.innerHTML = '<option value="all">All Specializations</option>' +
      topSpecs.map(spec => `<option value="${esc(spec.toLowerCase())}"${state.businessSpecialization === spec.toLowerCase() ? ' selected' : ''}>${esc(spec)} (${specCounts.get(spec)})</option>`).join('');
  }
}

export function professionalPersonCard(profile) {
  const image = safeUrl(profile.avatarUrl || profile.coverUrl);
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).slice(0, 4);
  const projectCount = typeof profile.projectCount === 'number' ? profile.projectCount : 0;
  const isSelf = state.currentUser && state.currentUser.uid === profile.id;
  const isConnected = state.connectedUserIds.has(profile.id);

  let connectAction = '';
  if (isSelf) {
    connectAction = `<span class="pro-badge-self" title="This is your public portfolio">You</span>`;
  } else if (isConnected) {
    connectAction = `<button class="pf-button connected-btn btn-sm" type="button" data-toggle-connect="${esc(profile.id)}" data-name="${esc(profile.displayName || 'Professional')}"><span>✓ Connected</span></button>`;
  } else {
    connectAction = `<button class="pf-button primary btn-sm" type="button" data-toggle-connect="${esc(profile.id)}" data-name="${esc(profile.displayName || 'Professional')}"><span>+ Connect</span></button>`;
  }

  return `
    <article class="pf-card pro-person-card" data-person-id="${esc(profile.id)}">
      <div class="pro-person-card-top">
        <a class="pro-person-avatar-wrap" href="portfolio.html?id=${encodeURIComponent(profile.id)}">
          ${image ? `<img data-portfolio-image src="${esc(image)}" alt="${esc(profile.displayName)}" loading="lazy">` : `<span class="pf-card-placeholder">${esc(initials(profile.displayName))}</span>`}
        </a>
        <div class="pro-person-header-meta">
          <div class="pro-person-kicker">
            <span>Portfolio</span>
            ${profile.location ? `<span class="pro-person-loc"><b aria-hidden="true">⌖</b> ${esc(profile.location)}</span>` : ''}
          </div>
          <h3><a href="portfolio.html?id=${encodeURIComponent(profile.id)}">${esc(profile.displayName || 'Portfolio')}</a></h3>
          <p class="pro-person-title">${esc(profile.professionalTitle || profile.tagline || 'Practitioner')}</p>
        </div>
      </div>

      <div class="pro-person-card-body">
        ${profile.tagline && profile.tagline !== profile.professionalTitle ? `<p class="pro-person-bio">${esc(profile.tagline)}</p>` : ''}

        <div class="pf-card-meta pro-person-skills">
          ${skills.map(skill => `<span>${esc(skill)}</span>`).join('')}
        </div>

        <div class="pro-person-stats">
          <span class="pro-person-stat"><strong>${projectCount}</strong> ${projectCount === 1 ? 'Project' : 'Projects'}</span>
          ${profile.availability ? `<span class="pro-person-availability"><i class="pro-dot" aria-hidden="true"></i> ${esc(profile.availability)}</span>` : ''}
        </div>
      </div>

      <div class="pro-person-card-actions">
        <a class="pf-button secondary btn-sm" href="portfolio.html?id=${encodeURIComponent(profile.id)}">View Portfolio</a>
        ${connectAction}
      </div>
    </article>
  `;
}



export function professionalBizPostCard(post) {
  const logo = safeUrl(post.businessLogoUrl || post.logoUrl);
  const photo = safeUrl(post.photoUrl || post.imageUrl);
  let dateStr = '';
  if (post.createdAt) {
    try {
      const d = typeof post.createdAt?.toDate === 'function' ? post.createdAt.toDate() : new Date(post.createdAt);
      if (!isNaN(d)) dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {}
  }

  return `
    <article class="pro-biz-feed-card" data-biz-post-id="${esc(post.id)}">
      <div class="pro-biz-feed-head">
        <a class="pro-biz-feed-avatar" href="portfolio.html?id=${encodeURIComponent(post.ownerUid)}">
          ${logo ? `<img src="${esc(logo)}" alt="${esc(post.businessName)}" loading="lazy">` : `<span>${esc(initials(post.businessName || 'Studio'))}</span>`}
        </a>
        <div class="pro-biz-feed-meta">
          <div class="pro-biz-feed-author">
            <a href="portfolio.html?id=${encodeURIComponent(post.ownerUid)}">
              <strong>${esc(post.businessName || 'Architecture Practice')}</strong>
              <span class="pro-verified-badge-mini" title="Verified Practice">✓</span>
            </a>
          </div>
          <div class="pro-biz-feed-time">
            <span>Studio Announcement</span>
            ${dateStr ? `<span>· ${esc(dateStr)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="pro-biz-feed-body">
        <h4 class="pro-biz-feed-title">${esc(post.title)}</h4>
        <p class="pro-biz-feed-text">${esc(post.body || post.content || '')}</p>
        ${photo ? `<div class="pro-biz-feed-photo"><img src="${esc(photo)}" alt="${esc(post.title)}" loading="lazy"></div>` : ''}
      </div>

      <div class="pro-biz-feed-foot">
        <a class="pf-button secondary btn-sm" href="portfolio.html?id=${encodeURIComponent(post.ownerUid)}">View Studio ↗</a>
        <a class="pf-button secondary btn-sm" href="/community.html?view=post&portfolioKind=biz_post&portfolioId=${encodeURIComponent(post.id)}">Share to Professional ↗</a>
      </div>
    </article>
  `;
}

export function professionalJobCard(job) {
  const logo = safeUrl(job.businessLogoUrl);
  const skills = [...(job.skills || []), ...(job.software || [])].slice(0, 4);
  const isSaved = state.savedOppIds.has(job.id);

  return `
    <article class="pro-job-card" data-opportunity-id="${esc(job.id)}">
      <div>
        <div class="pro-job-card-top">
          <a class="pro-job-company-logo" href="portfolio.html?id=${encodeURIComponent(job.ownerUid)}">
            ${logo ? `<img src="${esc(logo)}" alt="${esc(job.businessName)}" loading="lazy">` : `<span>${esc(initials(job.businessName || 'Studio'))}</span>`}
          </a>
          <div class="pro-job-meta-head">
            <span class="pro-job-type-badge job">💼 Job Opening</span>
            <h3 class="pro-job-title">${esc(job.title)}</h3>
            <a class="pro-job-company-link" href="portfolio.html?id=${encodeURIComponent(job.ownerUid)}">
              <span>${esc(job.businessName || 'Architecture Studio')}</span>
              <span class="pro-verified-badge-mini">✓</span>
            </a>
          </div>
        </div>

        <div class="pro-job-pill-row">
          <span class="pro-job-pill">⌖ ${esc(job.location || 'Basra, Iraq')}</span>
          <span class="pro-job-pill">${esc(job.employmentType || 'Full-time')}</span>
          <span class="pro-job-pill">${esc(job.workplaceType || 'On-site')}</span>
          <span class="pro-job-pill">Exp: ${esc(job.experience || 'Entry level')}</span>
          ${job.compensation ? `<span class="pro-job-pill" style="background:#ecfdf5;color:#047857;">💰 ${esc(job.compensation)}</span>` : ''}
        </div>

        ${job.description ? `<p class="pro-job-desc-snippet" style="margin-top:12px;">${esc(job.description)}</p>` : ''}

        ${skills.length ? `<div class="pro-job-chips-group">${skills.map(s => `<span class="pro-job-chip software">${esc(s)}</span>`).join('')}</div>` : ''}
      </div>

      <div class="pro-job-card-actions">
        <button class="pf-button primary btn-sm" type="button" data-view-opportunity="${esc(job.id)}"><span>View Job</span></button>
        <button class="pf-button secondary btn-sm" type="button" data-save-opportunity="${esc(job.id)}"><span>${isSaved ? '★ Saved' : '☆ Save'}</span></button>
      </div>
    </article>
  `;
}

export function professionalInternshipCard(internship) {
  const logo = safeUrl(internship.businessLogoUrl);
  const skills = [...(internship.skills || []), ...(internship.software || [])].slice(0, 4);
  const isSaved = state.savedOppIds.has(internship.id);

  return `
    <article class="pro-job-card" data-opportunity-id="${esc(internship.id)}">
      <div>
        <div class="pro-job-card-top">
          <a class="pro-job-company-logo" href="portfolio.html?id=${encodeURIComponent(internship.ownerUid)}">
            ${logo ? `<img src="${esc(logo)}" alt="${esc(internship.businessName)}" loading="lazy">` : `<span>${esc(initials(internship.businessName || 'Studio'))}</span>`}
          </a>
          <div class="pro-job-meta-head">
            <span class="pro-job-type-badge internship">🎓 Internship</span>
            <h3 class="pro-job-title">${esc(internship.title)}</h3>
            <a class="pro-job-company-link" href="portfolio.html?id=${encodeURIComponent(internship.ownerUid)}">
              <span>${esc(internship.businessName || 'Architecture Studio')}</span>
              <span class="pro-verified-badge-mini">✓</span>
            </a>
          </div>
        </div>

        <div class="pro-job-pill-row">
          <span class="pro-job-pill">⌖ ${esc(internship.location || 'Basra, Iraq')}</span>
          <span class="pro-job-pill">⏱ ${esc(internship.duration || '3 Months')}</span>
          <span class="pro-job-pill" style="background:#fdf4ff;color:#86198f;">${esc(internship.compensation || 'Paid')}</span>
          ${internship.deadline ? `<span class="pro-job-pill" style="background:#fff1f2;color:#be123c;">⏳ ${esc(internship.deadline)}</span>` : ''}
        </div>

        ${internship.description ? `<p class="pro-job-desc-snippet" style="margin-top:12px;">${esc(internship.description)}</p>` : ''}

        ${skills.length ? `<div class="pro-job-chips-group">${skills.map(s => `<span class="pro-job-chip software">${esc(s)}</span>`).join('')}</div>` : ''}
      </div>

      <div class="pro-job-card-actions">
        <button class="pf-button primary btn-sm" type="button" data-view-opportunity="${esc(internship.id)}"><span>View Internship</span></button>
        <button class="pf-button secondary btn-sm" type="button" data-save-opportunity="${esc(internship.id)}"><span>${isSaved ? '★ Saved' : '☆ Save'}</span></button>
      </div>
    </article>
  `;
}

export function professionalBusinessCard(biz) {
  const logo = safeUrl(biz.logoUrl);
  const cover = safeUrl(biz.coverUrl);
  const services = (Array.isArray(biz.services) ? biz.services : []).slice(0, 3);
  const projectCount = typeof biz.projectCount === 'number' ? biz.projectCount : 0;
  const isSelf = state.currentUser && state.currentUser.uid === biz.id;
  const isConnected = state.connectedUserIds.has(biz.id);

  let connectAction = '';
  if (isSelf) {
    connectAction = `<span class="pro-badge-self">Your Studio</span>`;
  } else if (isConnected) {
    connectAction = `<button class="pf-button connected-btn btn-sm" type="button" data-toggle-connect="${esc(biz.id)}" data-name="${esc(biz.name || 'Practice')}"><span>✓ Connected</span></button>`;
  } else {
    connectAction = `<button class="pf-button primary btn-sm" type="button" data-toggle-connect="${esc(biz.id)}" data-name="${esc(biz.name || 'Practice')}"><span>+ Connect</span></button>`;
  }

  return `
    <article class="pf-card pro-biz-card" data-biz-id="${esc(biz.id)}">
      ${cover ? `<div class="pro-biz-card-cover" style="background-image:url(${JSON.stringify(cover)})"></div>` : ''}
      <div class="pro-biz-card-inner">
        <div class="pro-biz-card-header">
          <a class="pro-biz-logo-wrap" href="portfolio.html?id=${encodeURIComponent(biz.id || biz.ownerUid)}">
            ${logo ? `<img src="${esc(logo)}" alt="${esc(biz.name)}" loading="lazy">` : `<span>${esc(initials(biz.name))}</span>`}
          </a>
          <div class="pro-biz-head-meta">
            <div class="pro-biz-kicker">
              <span>${esc(biz.industry || 'Architecture Practice')}</span>
              <span class="pro-verified-badge-mini" title="Master Admin Verified">✓</span>
            </div>
            <h3><a href="portfolio.html?id=${encodeURIComponent(biz.id || biz.ownerUid)}">${esc(biz.name || 'Architecture Studio')}</a></h3>
            <p class="pro-biz-loc"><span>⌖</span> ${esc(biz.location || 'Basra, Iraq')}</p>
          </div>
        </div>

        <div class="pro-biz-card-body">
          ${biz.shortDescription ? `<p class="pro-biz-bio">${esc(biz.shortDescription)}</p>` : ''}

          <div class="pf-card-meta pro-biz-services">
            ${services.map(s => `<span>${esc(s)}</span>`).join('')}
          </div>

          <div class="pro-person-stats">
            <span class="pro-person-stat"><strong>${projectCount}</strong> ${projectCount === 1 ? 'Project' : 'Projects'}</span>
            ${biz.companySize ? `<span class="pro-biz-size">👥 ${esc(biz.companySize)}</span>` : ''}
          </div>
        </div>

        <div class="pro-person-card-actions">
          <a class="pf-button secondary btn-sm" href="portfolio.html?id=${encodeURIComponent(biz.id || biz.ownerUid)}">View Portfolio</a>
          ${connectAction}
        </div>
      </div>
    </article>
  `;
}

function renderSuggestedPortfolios() {
  const container = $('suggestedPortfoliosList');
  if (!container) return;

  const filtered = state.profiles.filter(p => !state.currentUser || p.id !== state.currentUser.uid);
  const suggestions = filtered.slice(0, 3);

  if (!suggestions.length) {
    container.innerHTML = `<p class="pro-widget-empty">No other portfolios published yet.</p>`;
    return;
  }

  container.innerHTML = suggestions.map(p => {
    const avatar = safeUrl(p.avatarUrl || p.coverUrl);
    const title = p.professionalTitle || p.tagline || 'Professional Practitioner';
    return `
      <a class="pro-suggested-item" href="portfolio.html?id=${encodeURIComponent(p.id)}">
        <span class="pro-suggested-avatar">
          ${avatar ? `<img src="${esc(avatar)}" alt="${esc(p.displayName)}" loading="lazy">` : `<i>${esc(initials(p.displayName || 'PF'))}</i>`}
        </span>
        <span class="pro-suggested-copy">
          <strong>${esc(p.displayName || 'Portfolio')}</strong>
          <small>${esc(title)}</small>
        </span>
        <b class="pro-suggested-arrow" aria-hidden="true">→</b>
      </a>
    `;
  }).join('');
}

function renderHomeView() {
  const featuredWorkGrid = $('homeFeaturedWorkGrid');
  const bizPostsGrid = $('homeBizPostsGrid');
  const oppsGrid = $('homeOppsGrid');
  const peopleGrid = $('homePeopleGrid');
  const needle = state.searchQuery.trim().toLowerCase();

  const works = state.works.filter(categoryMatches).filter(w => itemSearchMatches(w, needle));
  const profiles = state.profiles.filter(categoryMatches).filter(p => itemSearchMatches(p, needle));
  const bizPosts = (state.businessPosts || []).filter(p => itemSearchMatches(p, needle));
  const allOpps = [...state.jobs, ...state.internships].filter(o => itemSearchMatches(o, needle));

  if (featuredWorkGrid) {
    const displayWorks = works.slice(0, 6);
    featuredWorkGrid.innerHTML = displayWorks.length
      ? displayWorks.map(workCard).join('')
      : emptyState('No published work matches', 'Try another search term or filter category.');
  }

  if (bizPostsGrid) {
    const displayPosts = bizPosts.slice(0, 4);
    const section = $('homeBizPostsSection');
    if (section) section.hidden = !displayPosts.length && Boolean(needle);
    bizPostsGrid.innerHTML = displayPosts.length
      ? displayPosts.map(professionalBizPostCard).join('')
      : emptyState('No studio announcements yet', 'Studio updates and news will appear here.');
  }

  if (oppsGrid) {
    const displayOpps = allOpps.slice(0, 4);
    const section = $('homeOppsSection');
    if (section) section.hidden = !displayOpps.length && Boolean(needle);
    oppsGrid.innerHTML = displayOpps.length
      ? displayOpps.map(opp => opp.type === 'internship' ? professionalInternshipCard(opp) : professionalJobCard(opp)).join('')
      : emptyState('No open opportunities currently', 'Studio jobs and internships will appear here.');
  }

  if (peopleGrid) {
    const displayProfiles = profiles.slice(0, 6);
    peopleGrid.innerHTML = displayProfiles.length
      ? displayProfiles.map(professionalPersonCard).join('')
      : emptyState('No professional portfolios match', 'Try another search term or filter category.');
  }
}

function renderWorkView() {
  const grid = $('workResultsGrid');
  if (!grid) return;
  const needle = state.searchQuery.trim().toLowerCase();
  const visible = state.works.filter(categoryMatches).filter(w => itemSearchMatches(w, needle));

  $('proViewSubtitle').textContent = `${visible.length} published ${visible.length === 1 ? 'project / work item' : 'projects / work items'}`;
  grid.innerHTML = visible.length
    ? visible.map(workCard).join('')
    : emptyState('No published work matches your search', 'Try adjusting your profession filter or search terms.');
}

function renderPeopleView() {
  const grid = $('peopleResultsGrid');
  if (!grid) return;
  const needle = state.searchQuery.trim().toLowerCase();

  let visible = state.profiles
    .filter(categoryMatches)
    .filter(p => {
      if (state.peopleLocation !== 'all') {
        const loc = (p.location || '').toLowerCase();
        if (!loc.includes(state.peopleLocation)) return false;
      }
      if (state.peopleSkill !== 'all') {
        const skills = Array.isArray(p.skills) ? p.skills.map(s => String(s).toLowerCase()) : [];
        if (!skills.includes(state.peopleSkill)) return false;
      }
      return itemSearchMatches(p, needle);
    });

  if (state.peopleSort === 'projects') {
    visible = [...visible].sort((a, b) => (b.projectCount || 0) - (a.projectCount || 0) || time(b.updatedAt) - time(a.updatedAt));
  } else if (state.peopleSort === 'name') {
    visible = [...visible].sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  } else {
    visible = [...visible].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }

  const hasActiveFilter = state.peopleLocation !== 'all' || state.peopleSkill !== 'all' || state.category !== 'all' || needle;
  const clearBtn = $('peopleClearFilters');
  if (clearBtn) clearBtn.hidden = !hasActiveFilter;

  $('proViewSubtitle').textContent = `${visible.length} professional ${visible.length === 1 ? 'portfolio' : 'portfolios'}`;
  grid.innerHTML = visible.length
    ? visible.map(professionalPersonCard).join('')
    : emptyState('No professional portfolios match your filters', 'Try clearing your location, skill, or profession filters.');
}


function populateJobFilters() {
  const locSelect = $('jobLocationFilter');
  if (locSelect) {
    const locations = [...new Set(state.jobs.map(j => (j.location || '').trim()).filter(Boolean))].sort();
    locSelect.innerHTML = '<option value="all">All Locations</option>' +
      locations.map(loc => `<option value="${esc(loc.toLowerCase())}"${state.jobLocation === loc.toLowerCase() ? ' selected' : ''}>${esc(loc)}</option>`).join('');
  }
}

function populateInternshipFilters() {
  const locSelect = $('internshipLocationFilter');
  if (locSelect) {
    const locations = [...new Set(state.internships.map(i => (i.location || '').trim()).filter(Boolean))].sort();
    locSelect.innerHTML = '<option value="all">All Locations</option>' +
      locations.map(loc => `<option value="${esc(loc.toLowerCase())}"${state.internshipLocation === loc.toLowerCase() ? ' selected' : ''}>${esc(loc)}</option>`).join('');
  }
}


function renderOppApplySection(opp) {
  if (!state.currentUser) {
    return `
      <div style="text-align:center;padding:20px;border-radius:16px;background:#f7f3ee;border:1px solid var(--line);">
        <strong style="display:block;font-size:0.95rem;color:var(--ink);margin-bottom:4px;">✦ Portfolio-Based Application</strong>
        <p style="margin:0 0 14px;font-size:0.84rem;color:var(--muted);">Sign in with your AIAS Basra account to apply directly using your verified BASRA Professional.</p>
        <a class="pf-button primary" href="login.html?next=${encodeURIComponent(window.location.href)}" style="display:inline-flex;padding:10px 20px;">Sign In to Apply →</a>
      </div>
    `;
  }

  if (state.currentUser.uid === opp.ownerUid) {
    return `
      <div style="text-align:center;padding:14px;border-radius:12px;background:#f7f3ee;font-weight:750;font-size:0.86rem;color:var(--muted);border:1px solid var(--line);">
        🏛️ Your Studio Listing
      </div>
    `;
  }

  const existingApp = state.myApplications.get(opp.id);
  if (existingApp) {
    const statusLabels = { new: 'Submitted (Pending Review)', reviewed: 'Under Review', shortlisted: 'Shortlisted ★', interview: 'Interview Scheduled', accepted: 'Accepted ✓', not_selected: 'Not Selected', withdrawn: 'Withdrawn' };
    return `
      <div style="text-align:center;padding:18px;border-radius:14px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;">
        <strong style="display:block;font-size:0.95rem;margin-bottom:4px;">✓ Application Submitted</strong>
        <p style="margin:0;font-size:0.84rem;">Status: <b>${statusLabels[existingApp.status] || existingApp.status}</b></p>
      </div>
    `;
  }

  if (!state.userPortfolio || state.userPortfolio.status !== 'published') {
    return `
      <div style="text-align:center;padding:20px;border-radius:16px;background:#fff5f5;border:1px solid #fed7d7;">
        <strong style="display:block;font-size:0.92rem;color:#991b1b;margin-bottom:4px;">✦ BASRA Professional Required to Apply</strong>
        <p style="margin:0 0 14px;font-size:0.82rem;color:#78716c;">You must have a published BASRA Professional to apply for professional studio opportunities.</p>
        <a class="pf-button primary" href="portfolio-builder.html" style="display:inline-flex;padding:10px 20px;">Create &amp; Publish Portfolio →</a>
      </div>
    `;
  }

  return `
    <button id="triggerApplyFormBtn" class="pf-button primary" type="button" style="width:100%;font-size:0.95rem;padding:12px 20px;">
      <span>✦ Apply with Verified Portfolio</span>
    </button>
  `;
}

function bindOppApplyEvents(opp, dialog) {
  const triggerBtn = dialog.querySelector('#triggerApplyFormBtn');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      const p = state.userPortfolio || {};
      const works = state.userWorks || [];
      const container = dialog.querySelector('#oppApplyContainer');
      if (!container) return;

      container.innerHTML = `
        <div style="padding:18px;border-radius:16px;background:#fcfaf8;border:1px solid #ebdcd5;">
          <h4 style="margin:0 0 6px;font-size:1.05rem;color:var(--wine);font-weight:850;">Apply for ${esc(opp.title)}</h4>
          <p style="margin:0 0 14px;font-size:0.8rem;color:var(--muted);">Your published portfolio will be attached as your professional application.</p>

          <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid var(--line);margin-bottom:14px;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--wine);color:#fff;display:grid;place-items:center;overflow:hidden;font-weight:800;font-size:0.9rem;">
              ${p.avatarUrl ? `<img src="${esc(safeUrl(p.avatarUrl))}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${esc(initials(p.displayName || 'Me'))}</span>`}
            </div>
            <div style="flex:1;">
              <strong style="display:block;font-size:0.88rem;color:var(--ink);">${esc(p.displayName || 'My Portfolio')}</strong>
              <span style="font-size:0.75rem;color:var(--wine);font-weight:750;">${esc(p.professionalTitle || 'Designer')}</span>
            </div>
            <a href="portfolio.html?id=${encodeURIComponent(state.currentUser.uid)}" target="_blank" class="pf-button secondary btn-sm" style="font-size:0.72rem;padding:4px 8px;">Preview ↗</a>
          </div>

          ${works.length ? `
            <div style="margin-bottom:14px;">
              <label style="font-size:0.78rem;font-weight:800;color:var(--ink);display:block;margin-bottom:6px;">Select Highlight Projects to Attach (optional, up to 4):</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                ${works.map(w => `
                  <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:0.75rem;">
                    <input type="checkbox" data-apply-work="${esc(w.id)}">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(w.title)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="margin-bottom:14px;">
            <label style="font-size:0.78rem;font-weight:800;color:var(--ink);display:block;margin-bottom:6px;">Message / Introduction (optional):</label>
            <textarea id="applyMessageInput" rows="3" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);font-size:0.82rem;box-sizing:border-box;" placeholder="Introduce yourself and your architectural interests…"></textarea>
          </div>

          <div style="display:flex;gap:10px;">
            <button id="submitApplicationFinalBtn" class="pf-button primary" type="button" style="flex:1;"><span>Submit Application</span></button>
            <button id="cancelApplyFormBtn" class="pf-button secondary" type="button">Back</button>
          </div>
        </div>
      `;

      container.querySelector('#cancelApplyFormBtn')?.addEventListener('click', () => {
        container.innerHTML = renderOppApplySection(opp);
        bindOppApplyEvents(opp, dialog);
      });

      container.querySelector('#submitApplicationFinalBtn')?.addEventListener('click', async () => {
        const submitBtn = container.querySelector('#submitApplicationFinalBtn');
        const coverLetter = container.querySelector('#applyMessageInput')?.value || '';
        const selectedWorkIds = Array.from(container.querySelectorAll('[data-apply-work]:checked')).map(cb => cb.dataset.applyWork).slice(0, 4);

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Submitting application…</span>';

        try {
          const res = await callFunction('submitJobApplication', {
            opportunityId: opp.id,
            coverLetter,
            selectedWorkIds
          });

          state.myApplications.set(opp.id, {
            id: res.applicationId,
            opportunityId: opp.id,
            status: 'new'
          });

          showToast('Application submitted successfully!');
          container.innerHTML = renderOppApplySection(opp);
        } catch (err) {
          console.error(err);
          showToast(friendlyError(err, 'Could not submit application.'));
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Submit Application</span>';
        }
      });
    });
  }
}

function renderJobsView() {
  const grid = $('jobsResultsGrid');
  if (!grid) return;
  const needle = state.searchQuery.trim().toLowerCase();

  let visible = state.jobs
    .filter(categoryMatches)
    .filter(j => {
      if (state.jobLocation !== 'all' && !(j.location || '').toLowerCase().includes(state.jobLocation)) return false;
      if (state.jobType !== 'all' && !(j.employmentType || '').toLowerCase().includes(state.jobType)) return false;
      if (state.jobWorkplace !== 'all' && !(j.workplaceType || '').toLowerCase().includes(state.jobWorkplace)) return false;
      if (state.jobExperience !== 'all' && !(j.experience || '').toLowerCase().includes(state.jobExperience)) return false;
      return itemSearchMatches(j, needle);
    });

  const hasFilter = state.jobLocation !== 'all' || state.jobType !== 'all' || state.jobWorkplace !== 'all' || state.jobExperience !== 'all' || needle;
  const clearBtn = $('jobClearFilters');
  if (clearBtn) clearBtn.hidden = !hasFilter;

  $('proViewSubtitle').textContent = `${visible.length} architectural ${visible.length === 1 ? 'job opening' : 'job openings'}`;

  if (!visible.length) {
    grid.innerHTML = emptyState('No job openings match your filters', 'Try adjusting your employment type, workplace mode, or location filter.');
    return;
  }

  grid.innerHTML = visible.map(professionalJobCard).join('');
}

function renderInternshipsView() {
  const grid = $('internshipsResultsGrid');
  if (!grid) return;
  const needle = state.searchQuery.trim().toLowerCase();

  let visible = state.internships
    .filter(categoryMatches)
    .filter(i => {
      if (state.internshipLocation !== 'all' && !(i.location || '').toLowerCase().includes(state.internshipLocation)) return false;
      if (state.internshipDuration !== 'all' && !(i.duration || '').toLowerCase().includes(state.internshipDuration)) return false;
      if (state.internshipCompensation !== 'all' && !(i.compensation || '').toLowerCase().includes(state.internshipCompensation)) return false;
      return itemSearchMatches(i, needle);
    });

  const hasFilter = state.internshipLocation !== 'all' || state.internshipDuration !== 'all' || state.internshipCompensation !== 'all' || needle;
  const clearBtn = $('internshipClearFilters');
  if (clearBtn) clearBtn.hidden = !hasFilter;

  $('proViewSubtitle').textContent = `${visible.length} studio ${visible.length === 1 ? 'internship & training program' : 'internships & training programs'}`;

  if (!visible.length) {
    grid.innerHTML = emptyState('No internships match your search', 'Try adjusting your duration or compensation filter.');
    return;
  }

  grid.innerHTML = visible.map(professionalInternshipCard).join('');
}

function renderBusinessesView() {
  const grid = $('businessesResultsGrid');
  if (!grid) return;
  const needle = state.searchQuery.trim().toLowerCase();

  let visible = state.businesses
    .filter(categoryMatches)
    .filter(b => {
      if (state.businessLocation !== 'all') {
        const loc = (b.location || '').toLowerCase();
        if (!loc.includes(state.businessLocation)) return false;
      }
      if (state.businessIndustry !== 'all') {
        const ind = (b.industry || '').toLowerCase();
        if (!ind.includes(state.businessIndustry)) return false;
      }
      if (state.businessSpecialization !== 'all') {
        const specs = [
          ...(Array.isArray(b.services) ? b.services : []),
          ...(Array.isArray(b.specializations) ? b.specializations : [])
        ].map(s => String(s || '').toLowerCase());
        if (!specs.some(s => s.includes(state.businessSpecialization))) return false;
      }
      return itemSearchMatches(b, needle);
    });

  const hasActiveFilter = state.businessLocation !== 'all' || state.businessIndustry !== 'all' || state.businessSpecialization !== 'all' || needle;
  const clearBtn = $('businessClearFilters');
  if (clearBtn) clearBtn.hidden = !hasActiveFilter;

  $('proViewSubtitle').textContent = `${visible.length} verified ${visible.length === 1 ? 'practice & business' : 'practices & businesses'}`;

  if (!visible.length) {
    grid.innerHTML = emptyState('No verified practices match your search', 'Try adjusting your location, industry, or specialization filter.');
    return;
  }

  grid.innerHTML = visible.map(professionalBusinessCard).join('');
}

function renderConnectionsView() {
  const container = $('connectionsContainer');
  if (!container) return;

  if (!state.currentUser) {
    container.innerHTML = `
      <div class="pro-placeholder-card">
        <div class="pro-placeholder-icon">◎</div>
        <h3>Sign In to View Connections</h3>
        <p>Sign in to your AIAS Basra Professional account to view your professional connections and network with colleagues.</p>
        <a class="pf-button primary" href="login.html?next=portfolios.html%3Ftab%3Dconnections">Sign In →</a>
      </div>
    `;
    return;
  }

  const needle = state.searchQuery.trim().toLowerCase();
  const visible = state.connectedProfiles.filter(p => itemSearchMatches(p, needle));

  $('proViewSubtitle').textContent = `${visible.length} connected ${visible.length === 1 ? 'professional' : 'professionals'}`;

  if (!visible.length) {
    container.innerHTML = `
      <div class="pro-placeholder-card">
        <div class="pro-placeholder-icon">👥</div>
        <h3>No Connected Professionals Yet</h3>
        <p>When you connect with registered members who have a published BASRA Professional, they will appear here in your professional network.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="pf-button primary" data-navigate-tab="people">Discover Professionals →</button>
          <a class="pf-button secondary" href="/community.html?view=connections">Professional Connections</a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="pro-connections-header-bar">
      <span>Manage all community and space connections:</span>
      <a class="pro-community-conn-btn" href="/community.html?view=connections">Professional Connection Manager ↗</a>
    </div>
    <div class="pf-grid pro-people-grid">${visible.map(professionalPersonCard).join('')}</div>
  `;
}

function renderActiveView() {
  const meta = TAB_METADATA[state.activeTab] || TAB_METADATA.home;

  if ($('proViewTitle')) $('proViewTitle').textContent = meta.title;
  if ($('proViewSubtitle')) $('proViewSubtitle').textContent = meta.subtitle;

  const chipsContainer = $('proCategoryChipsContainer');
  if (chipsContainer) {
    chipsContainer.hidden = !meta.showChips;
  }

  // Update panel visibility
  document.querySelectorAll('.pro-panel').forEach(panel => {
    const isTarget = panel.id === `panel-${state.activeTab}`;
    panel.classList.toggle('active', isTarget);
    panel.hidden = !isTarget;
  });

  // Update nav item active state
  document.querySelectorAll('.pro-nav-item').forEach(btn => {
    const isTarget = btn.dataset.tab === state.activeTab;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', String(isTarget));
  });

  // Render specific tab content
  if (state.activeTab === 'home') renderHomeView();
  else if (state.activeTab === 'work') renderWorkView();
  else if (state.activeTab === 'people') renderPeopleView();
  else if (state.activeTab === 'businesses') renderBusinessesView();
  else if (state.activeTab === 'jobs') renderJobsView();
  else if (state.activeTab === 'internships') renderInternshipsView();
  else if (state.activeTab === 'connections') renderConnectionsView();
}

function switchTab(tabId) {
  if (!TAB_METADATA[tabId]) tabId = 'home';
  state.activeTab = tabId;

  try {
    const url = new URL(window.location.href);
    if (tabId === 'home') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url);
  } catch (e) {}

  renderActiveView();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

async function handleToggleConnection(targetUserId, targetName = 'Professional') {
  if (!state.currentUser) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
    return;
  }

  if (!targetUserId || targetUserId === state.currentUser.uid) return;

  const willConnect = !state.connectedUserIds.has(targetUserId);
  const currentUid = state.currentUser.uid;

  if (willConnect) state.connectedUserIds.add(targetUserId);
  else state.connectedUserIds.delete(targetUserId);

  updateConnectionStateEverywhere(targetUserId, willConnect);

  try {
    const batch = writeBatch(db);
    const connectionRef = doc(db, 'users', currentUid, 'connections', targetUserId);
    const followerRef = doc(db, 'users', targetUserId, 'followers', currentUid);

    if (willConnect) {
      const record = {userId: currentUid, targetUserId, createdAt: serverTimestamp()};
      batch.set(connectionRef, record);
      batch.set(followerRef, record);
    } else {
      batch.delete(connectionRef);
      batch.delete(followerRef);
    }

    await batch.commit();

    const notifRef = doc(db, 'users', targetUserId, 'notifications', `connection_${targetUserId}_${currentUid}`);
    if (willConnect) {
      await setDoc(notifRef, {
        recipientId: targetUserId,
        actorId: currentUid,
        actorName: state.userPortfolio?.displayName || state.userProfileData?.displayName || state.currentUser.displayName || 'Member',
        actorUsername: state.userProfileData?.username || '',
        type: 'connection',
        postId: '',
        postTitle: 'Professional connection',
        detailId: targetUserId,
        read: false,
        createdAt: serverTimestamp()
      });
    } else {
      await deleteDoc(notifRef).catch(() => {});
    }

    await loadConnectionsData();
    showToast(willConnect ? `Connected with ${targetName}` : `Disconnected from ${targetName}`);
  } catch (error) {
    console.error('[Professional] Connection update failed:', error);
    if (willConnect) state.connectedUserIds.delete(targetUserId);
    else state.connectedUserIds.add(targetUserId);
    updateConnectionStateEverywhere(targetUserId, !willConnect);
    showToast('Could not update connection. Please try again.');
  }
}

function updateConnectionStateEverywhere(targetUserId, isConnected) {
  document.querySelectorAll(`[data-toggle-connect="${targetUserId}"]`).forEach(btn => {
    if (isConnected) {
      btn.className = 'pf-button connected-btn btn-sm';
      btn.innerHTML = '<span>✓ Connected</span>';
    } else {
      btn.className = 'pf-button primary btn-sm';
      btn.innerHTML = '<span>+ Connect</span>';
    }
  });

  state.connectedProfiles = state.profiles.filter(p => state.connectedUserIds.has(p.id));
  const count = state.connectedProfiles.length;
  const badge = $('navConnectionCount');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
}

async function loadConnectionsData() {
  if (!state.currentUser) {
    state.connectedUserIds = new Set();
    state.connectedProfiles = [];
    if ($('navConnectionCount')) $('navConnectionCount').hidden = true;
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, 'users', state.currentUser.uid, 'connections'));
    state.connectedUserIds = new Set(snapshot.docs.map(doc => doc.id));
    state.connectedProfiles = state.profiles.filter(p => state.connectedUserIds.has(p.id));

    const count = state.connectedProfiles.length;
    const badge = $('navConnectionCount');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
  } catch (error) {
    console.warn('[Professional] Could not load connections:', error);
  }
}

async function initAuth() {
  onAuthStateChanged(auth, async user => {
    state.currentUser = user;
    const topBuilderBtn = $('topBuilderBtn');
    if (topBuilderBtn) {
      topBuilderBtn.textContent = user ? 'My Portfolio' : 'Build Portfolio';
      topBuilderBtn.href = user ? 'portfolio-builder.html' : 'login.html?next=portfolio-builder.html';
    }

    if (user) {
      try {
        const [profileSnap, userSnap, bizAccountSnap, bizProfileSnap] = await Promise.all([
          getDoc(doc(db, 'portfolioProfiles', user.uid)),
          getDoc(doc(db, 'users', user.uid)).catch(() => null),
          getDoc(doc(db, 'businessAccounts', user.uid)).catch(() => null),
          getDoc(doc(db, 'businessProfiles', user.uid)).catch(() => null)
        ]);

        if (userSnap && userSnap.exists()) {
          state.userProfileData = userSnap.data();
        }

        if (profileSnap.exists() && profileSnap.data().status === 'published') {
          state.userPortfolio = { id: profileSnap.id, ...profileSnap.data() };
        } else {
          state.userPortfolio = null;
        }

        const [myAppsSnap, userWorksSnap] = await Promise.all([
          getDocs(query(collection(db, 'jobApplications'), where('applicantUid', '==', user.uid))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'portfolioWorks'), where('ownerId', '==', user.uid), where('status', '==', 'published'))).catch(() => ({ docs: [] }))
        ]);

        state.myApplications = new Map(myAppsSnap.docs.map(d => [d.data().opportunityId, { id: d.id, ...d.data() }]));
        state.userWorks = userWorksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (bizAccountSnap && bizAccountSnap.exists()) {
          state.userBusinessAccount = bizAccountSnap.data();
        } else {
          state.userBusinessAccount = null;
        }

        if (bizProfileSnap && bizProfileSnap.exists()) {
          state.userBusinessProfile = bizProfileSnap.data();
        } else {
          state.userBusinessProfile = null;
        }
      } catch (e) {
        console.warn('[Professional] Auth data check error:', e);
      }
    } else {
      state.userPortfolio = null;
      state.userProfileData = null;
      state.userBusinessAccount = null;
      state.userBusinessProfile = null;
    }

    renderIdentityCard();
    await loadConnectionsData();
    if (state.activeTab === 'people') renderPeopleView();
    if (state.activeTab === 'businesses') renderBusinessesView();
    if (state.activeTab === 'connections') renderConnectionsView();
    renderSuggestedPortfolios();
  });
}

function bindEvents() {
  document.addEventListener('click', event => {
    const tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      switchTab(tabBtn.dataset.tab);
      $('proLeftSidebar')?.classList.remove('mobile-open');
      return;
    }

    const navBtn = event.target.closest('[data-navigate-tab]');
    if (navBtn) {
      switchTab(navBtn.dataset.navigateTab);
      return;
    }

    const categoryBtn = event.target.closest('[data-category]');
    if (categoryBtn) {
      state.category = categoryBtn.dataset.category;
      renderTags();
      renderActiveView();
      return;
    }

    const connectBtn = event.target.closest('[data-toggle-connect]');
    if (connectBtn) {
      const targetId = connectBtn.dataset.toggleConnect;
      const targetName = connectBtn.dataset.name || 'Member';
      handleToggleConnection(targetId, targetName);
      return;
    }
  });

  // People filters
  $('peopleLocationFilter')?.addEventListener('change', () => {
    state.peopleLocation = $('peopleLocationFilter').value;
    renderPeopleView();
  });

  $('peopleSkillFilter')?.addEventListener('change', () => {
    state.peopleSkill = $('peopleSkillFilter').value;
    renderPeopleView();
  });

  $('peopleSortFilter')?.addEventListener('change', () => {
    state.peopleSort = $('peopleSortFilter').value;
    renderPeopleView();
  });

  $('peopleClearFilters')?.addEventListener('click', () => {
    state.peopleLocation = 'all';
    state.peopleSkill = 'all';
    state.category = 'all';
    state.searchQuery = '';
    if ($('globalSearchInput')) $('globalSearchInput').value = '';
    if ($('peopleLocationFilter')) $('peopleLocationFilter').value = 'all';
    if ($('peopleSkillFilter')) $('peopleSkillFilter').value = 'all';
    renderTags();
    renderPeopleView();
  });

  // Business filters
  $('businessLocationFilter')?.addEventListener('change', () => {
    state.businessLocation = $('businessLocationFilter').value;
    renderBusinessesView();
  });

  $('businessIndustryFilter')?.addEventListener('change', () => {
    state.businessIndustry = $('businessIndustryFilter').value;
    renderBusinessesView();
  });

  $('businessSpecializationFilter')?.addEventListener('change', () => {
    state.businessSpecialization = $('businessSpecializationFilter').value;
    renderBusinessesView();
  });

  $('businessClearFilters')?.addEventListener('click', () => {
    state.businessLocation = 'all';
    state.businessIndustry = 'all';
    state.businessSpecialization = 'all';
    state.category = 'all';
    state.searchQuery = '';
    if ($('globalSearchInput')) $('globalSearchInput').value = '';
    if ($('businessLocationFilter')) $('businessLocationFilter').value = 'all';
    if ($('businessIndustryFilter')) $('businessIndustryFilter').value = 'all';
    if ($('businessSpecializationFilter')) $('businessSpecializationFilter').value = 'all';
    renderTags();
    renderBusinessesView();
  });

  // Global search
  $('globalSearchInput')?.addEventListener('input', () => {
    state.searchQuery = $('globalSearchInput').value;
    if (['jobs', 'internships', 'saved'].includes(state.activeTab) && state.searchQuery.trim()) {
      state.activeTab = 'businesses';
    }
    renderActiveView();
  });


  // Job filters
  $('jobLocationFilter')?.addEventListener('change', () => {
    state.jobLocation = $('jobLocationFilter').value;
    renderJobsView();
  });
  $('jobTypeFilter')?.addEventListener('change', () => {
    state.jobType = $('jobTypeFilter').value;
    renderJobsView();
  });
  $('jobWorkplaceFilter')?.addEventListener('change', () => {
    state.jobWorkplace = $('jobWorkplaceFilter').value;
    renderJobsView();
  });
  $('jobExperienceFilter')?.addEventListener('change', () => {
    state.jobExperience = $('jobExperienceFilter').value;
    renderJobsView();
  });
  $('jobClearFilters')?.addEventListener('click', () => {
    state.jobLocation = 'all';
    state.jobType = 'all';
    state.jobWorkplace = 'all';
    state.jobExperience = 'all';
    state.searchQuery = '';
    if ($('globalSearchInput')) $('globalSearchInput').value = '';
    if ($('jobLocationFilter')) $('jobLocationFilter').value = 'all';
    if ($('jobTypeFilter')) $('jobTypeFilter').value = 'all';
    if ($('jobWorkplaceFilter')) $('jobWorkplaceFilter').value = 'all';
    if ($('jobExperienceFilter')) $('jobExperienceFilter').value = 'all';
    renderJobsView();
  });

  // Internship filters
  $('internshipLocationFilter')?.addEventListener('change', () => {
    state.internshipLocation = $('internshipLocationFilter').value;
    renderInternshipsView();
  });
  $('internshipDurationFilter')?.addEventListener('change', () => {
    state.internshipDuration = $('internshipDurationFilter').value;
    renderInternshipsView();
  });
  $('internshipCompensationFilter')?.addEventListener('change', () => {
    state.internshipCompensation = $('internshipCompensationFilter').value;
    renderInternshipsView();
  });
  $('internshipClearFilters')?.addEventListener('click', () => {
    state.internshipLocation = 'all';
    state.internshipDuration = 'all';
    state.internshipCompensation = 'all';
    state.searchQuery = '';
    if ($('globalSearchInput')) $('globalSearchInput').value = '';
    if ($('internshipLocationFilter')) $('internshipLocationFilter').value = 'all';
    if ($('internshipDurationFilter')) $('internshipDurationFilter').value = 'all';
    if ($('internshipCompensationFilter')) $('internshipCompensationFilter').value = 'all';
    renderInternshipsView();
  });

  // Opportunity details modal & bookmark save
  document.addEventListener('click', event => {
    const viewBtn = event.target.closest('[data-view-opportunity]');
    if (viewBtn) {
      const oppId = viewBtn.dataset.viewOpportunity;
      const allOpps = [...state.jobs, ...state.internships];
      const opp = allOpps.find(o => o.id === oppId);
      if (!opp) return;

      let dialog = $('proOpportunityDialog');
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
              <a href="portfolio.html?id=${encodeURIComponent(opp.ownerUid)}" style="font-size:0.88rem;color:var(--wine);font-weight:800;text-decoration:none;">${esc(opp.businessName || 'Architecture Studio')} ✓ ↗</a>
            </div>
            <button type="button" class="pro-opportunity-modal-close" aria-label="Close dialog">×</button>
          </div>

          <div class="pro-job-pill-row" style="margin-bottom:16px;">
            <span class="pro-job-pill">⌖ ${esc(opp.location || 'Basra, Iraq')}</span>
            ${isJob ? `<span class="pro-job-pill">${esc(opp.employmentType || 'Full-time')}</span><span class="pro-job-pill">${esc(opp.workplaceType || 'On-site')}</span><span class="pro-job-pill">Exp: ${esc(opp.experience || 'Entry')}</span>` : `<span class="pro-job-pill">⏱ ${esc(opp.duration || '3 Months')}</span><span class="pro-job-pill">${esc(opp.compensation || 'Paid')}</span>`}
            ${opp.compensation && isJob ? `<span class="pro-job-pill" style="background:#ecfdf5;color:#047857;">💰 ${esc(opp.compensation)}</span>` : ''}
            ${opp.deadline ? `<span class="pro-job-pill" style="background:#fff1f2;color:#be123c;">⏳ Deadline: ${esc(opp.deadline)}</span>` : ''}
          </div>

          <div style="font-size:0.9rem;line-height:1.65;color:var(--ink);margin-bottom:20px;white-space:pre-line;">${esc(opp.description || '')}</div>

          ${skills.length ? `<div style="margin-bottom:14px;"><strong style="display:block;font-size:0.8rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Required Capabilities:</strong><div class="pro-job-chips-group">${skills.map(s => `<span class="pro-job-chip">${esc(s)}</span>`).join('')}</div></div>` : ''}
          ${software.length ? `<div style="margin-bottom:14px;"><strong style="display:block;font-size:0.8rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Required Software:</strong><div class="pro-job-chips-group">${software.map(s => `<span class="pro-job-chip software">${esc(s)}</span>`).join('')}</div></div>` : ''}
          ${opp.studentRequirements ? `<div style="margin-bottom:14px;padding:12px;border-radius:10px;background:#fdf4ff;border:1px solid #f5d0fe;font-size:0.84rem;color:#701a75;"><strong>Student Requirements:</strong> ${esc(opp.studentRequirements)}</div>` : ''}

          <div id="oppApplyContainer" style="margin-top:24px;">
            ${renderOppApplySection(opp)}
          </div>
        </div>
      `;

      dialog.querySelector('.pro-opportunity-modal-close').addEventListener('click', () => dialog.close());
      bindOppApplyEvents(opp, dialog);
      dialog.showModal();
      return;
    }

    const saveBtn = event.target.closest('[data-save-opportunity]');
    if (saveBtn) {
      const oppId = saveBtn.dataset.saveOpportunity;
      if (state.savedOppIds.has(oppId)) {
        state.savedOppIds.delete(oppId);
        saveBtn.innerHTML = '<span>☆ Save</span>';
        showToast('Opportunity removed from bookmarks');
      } else {
        state.savedOppIds.add(oppId);
        saveBtn.innerHTML = '<span>★ Saved</span>';
        showToast('Opportunity saved to your bookmarks');
      }
      localStorage.setItem('pro_saved_opps', JSON.stringify([...state.savedOppIds]));
      return;
    }
  });

  $('mobileNavToggle')?.addEventListener('click', () => {
    $('proLeftSidebar')?.classList.toggle('mobile-open');
  });
}

async function init() {
  bindEvents();
  renderIdentityCard();

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab');
  if (initialTab && TAB_METADATA[initialTab]) {
    state.activeTab = initialTab;
  }
  const initialSearch = urlParams.get('search') || urlParams.get('q');
  if (initialSearch) {
    state.searchQuery = initialSearch;
    if ($('globalSearchInput')) $('globalSearchInput').value = initialSearch;
  }
  const initialCategory = urlParams.get('category');
  if (initialCategory) {
    state.category = initialCategory;
  }

  initAuth();

  try {
    const [profilesSnap, worksSnap, bizProfilesSnap, tagsDoc, oppsSnap, bizPostsSnap] = await Promise.all([
      getDocs(query(collection(db, 'portfolioProfiles'), where('status', '==', 'published'))),
      getDocs(query(collection(db, 'portfolioWorks'), where('status', '==', 'published'), where('moderationStatus', '==', 'clear'))),
      getDocs(query(collection(db, 'businessProfiles'), where('status', '==', 'published'))),
      getDoc(doc(db, 'config', 'portfolioTags')),
      getDocs(query(collection(db, 'businessOpportunities'), where('status', '==', 'open'))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'businessPosts'), where('status', '==', 'published'))).catch(() => ({ docs: [] }))
    ]);

    // Rules expose published Business Profiles only while the authoritative
    // Business Account is active, so no private account records are queried.
    const activeBizUids = new Set(bizProfilesSnap.docs.map(d => d.id));
    const publishedProfilesMap = new Map(profilesSnap.docs.map(d => [d.id, d.data()]));
    const bizProfilesMap = new Map(bizProfilesSnap.docs.map(d => [d.id, d.data()]));

    state.tags = tagsDoc.exists() && Array.isArray(tagsDoc.data().tags) ? tagsDoc.data().tags : DEFAULT_TAGS;
    state.profiles = profilesSnap.docs.map(d => ({id:d.id, ...d.data()}));
    state.works = worksSnap.docs.map(d => ({id:d.id, ...d.data()}));

    // Task 9 Eligibility Rule:
    // Only show businesses that have active Business Status AND a valid published Portfolio.
    // If an approved Business does not have a published Portfolio, it must NOT appear.
    state.businesses = [];
    activeBizUids.forEach(uid => {
      if (publishedProfilesMap.has(uid)) {
        const port = publishedProfilesMap.get(uid);
        const biz = bizProfilesMap.get(uid) || {};
        state.businesses.push({
          id: uid,
          ownerUid: uid,
          name: biz.name || port.displayName || 'Architecture Practice',
          industry: biz.industry || port.professionalTitle || 'Architecture & Design',
          location: biz.location || port.location || 'Basra, Iraq',
          logoUrl: biz.logoUrl || port.avatarUrl || '',
          coverUrl: biz.coverUrl || port.coverUrl || '',
          shortDescription: biz.shortDescription || port.tagline || '',
          about: biz.about || '',
          companySize: biz.companySize || '1-10 architects & designers',
          services: Array.isArray(biz.services) && biz.services.length ? biz.services : (Array.isArray(port.skills) ? port.skills : []),
          specializations: Array.isArray(biz.specializations) ? biz.specializations : [],
          website: biz.website || '',
          status: 'published'
        });
      }
    });

    // Process Open Opportunities from approved businesses
    const allOpenOpps = (oppsSnap?.docs || [])
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => activeBizUids.has(o.ownerUid) && publishedProfilesMap.has(o.ownerUid));

    state.jobs = allOpenOpps.filter(o => o.type === 'job');
    state.internships = allOpenOpps.filter(o => o.type === 'internship');

    state.businessPosts = (bizPostsSnap?.docs || [])
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => activeBizUids.has(p.ownerUid) && publishedProfilesMap.has(p.ownerUid));

    computeProjectCounts();

    renderTags();
    populatePeopleFilters();
    populateBusinessFilters();
    populateJobFilters();
    populateInternshipFilters();
    renderSuggestedPortfolios();
    renderActiveView();
    await loadConnectionsData();
  } catch (error) {
    console.error('[Professional] Initialization error:', error);
    state.tags = DEFAULT_TAGS;
    renderTags();
    renderActiveView();
  }
}

init();
