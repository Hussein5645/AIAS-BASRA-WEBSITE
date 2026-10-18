import {auth, db, storage, callFunction} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {doc, getDoc} from '/js/cloudflare-client.js';
import {ref as storageRef, uploadBytes, getDownloadURL} from '/js/cloudflare-client.js';

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentApplication = null;
let galleryUrls = [];

function showStatus(message, isError = false) {
  const statusEl = $('saveStatus');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#991b1b' : '#166534';
  }
}

function parseList(str) {
  return String(str || '').split(',').map(s => s.trim()).filter(Boolean);
}

function joinList(arr) {
  return Array.isArray(arr) ? arr.join(', ') : '';
}

function renderLogoPreview(url) {
  const box = $('logoPreviewBox');
  const img = $('logoPreviewImg');
  const hiddenInput = $('bizLogoUrl');
  if (url) {
    hiddenInput.value = url;
    img.src = url;
    box.classList.add('has-image');
  } else {
    hiddenInput.value = '';
    img.src = '';
    box.classList.remove('has-image');
  }
}

function renderCoverPreview(url) {
  const box = $('coverPreviewBox');
  const img = $('coverPreviewImg');
  const hiddenInput = $('bizCoverUrl');
  if (url) {
    hiddenInput.value = url;
    img.src = url;
    box.classList.add('has-image');
  } else {
    hiddenInput.value = '';
    img.src = '';
    box.classList.remove('has-image');
  }
}

function renderGalleryGrid() {
  const container = $('galleryGrid');
  if (!container) return;
  container.innerHTML = galleryUrls.map((url, index) => `
    <div class="gallery-preview-card">
      <img src="${url}" alt="Studio gallery photo" loading="lazy">
      <button type="button" class="remove-image-btn" data-remove-gallery="${index}" title="Remove photo">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-gallery]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.removeGallery, 10);
      if (!isNaN(idx) && idx >= 0 && idx < galleryUrls.length) {
        galleryUrls.splice(idx, 1);
        renderGalleryGrid();
      }
    });
  });
}

async function uploadImageToStorage(file, path) {
  if (!file) throw new Error('No file selected');
  if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
    throw new Error('Please select a valid image (PNG, JPEG, or WebP)');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image size must be 10MB or less');
  }

  const sRef = storageRef(storage, path);
  const result = await uploadBytes(sRef, file, { contentType: file.type });
  return await getDownloadURL(result.ref);
}

async function loadBusinessData(uid) {
  try {
    const [bizAccountSnap, profileSnap, userSnap, applicationSnap] = await Promise.all([
      getDoc(doc(db, 'businessAccounts', uid)),
      getDoc(doc(db, 'businessProfiles', uid)),
      getDoc(doc(db, 'users', uid)).catch(() => null),
      getDoc(doc(db, 'businessApplications', uid)).catch(() => null)
    ]);

    $('loadingState').hidden = true;

    if (!bizAccountSnap.exists() || bizAccountSnap.data().status !== 'active') {
      $('restrictedState').hidden = false;
      $('bizProfileForm').hidden = true;
      currentApplication = applicationSnap?.exists() ? applicationSnap.data() : null;
      renderBusinessApplication(currentApplication, bizAccountSnap.exists() ? bizAccountSnap.data() : null, userSnap?.exists() ? userSnap.data() : {});
      return;
    }

    $('restrictedState').hidden = true;
    $('bizProfileForm').hidden = false;

    const userData = userSnap?.exists() ? userSnap.data() : {};
    const bizAccount = bizAccountSnap.data();

    if (profileSnap.exists()) {
      currentProfile = profileSnap.data();
      $('bizName').value = currentProfile.name || bizAccount.businessName || '';
      $('bizUsername').value = currentProfile.username || '';
      $('bizIndustry').value = currentProfile.industry || 'Architecture & Design';
      $('bizLocation').value = currentProfile.location || '';
      $('bizCompanySize').value = currentProfile.companySize || '1-10 employees';
      $('bizTagline').value = currentProfile.shortDescription || '';
      $('bizAbout').value = currentProfile.about || '';
      $('bizServices').value = joinList(currentProfile.services);
      $('bizSpecializations').value = joinList(currentProfile.specializations);
      $('bizWebsite').value = currentProfile.website || '';
      $('bizEmail').value = currentProfile.contactEmail || '';
      $('bizPhone').value = currentProfile.contactPhone || '';
      $('bizAddress').value = currentProfile.address || '';

      renderLogoPreview(currentProfile.logoUrl || '');
      renderCoverPreview(currentProfile.coverUrl || '');

      galleryUrls = Array.isArray(currentProfile.gallery) ? [...currentProfile.gallery] : [];
      renderGalleryGrid();

      const previewBtn = $('previewPublicBizBtn');
      if (previewBtn) {
        previewBtn.href = `portfolio.html?id=${encodeURIComponent(uid)}`;
        previewBtn.hidden = false;
      }
    } else {
      // Pre-fill defaults from Community profile / business account
      $('bizName').value = bizAccount.businessName || userData.displayName || '';
      $('bizUsername').value = (userData.username || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || `studio_${uid.slice(0, 6)}`;
      $('bizIndustry').value = 'Architecture & Urban Design';
      $('bizLocation').value = userData.location || 'Basra, Iraq';
      $('bizEmail').value = userData.email || '';
    }
  } catch (error) {
    console.error('[BusinessBuilder] Load error:', error);
    $('loadingState').innerHTML = `<div class="pf-empty"><h3>Loading error</h3><p>${error.message}</p></div>`;
  }
}

function renderBusinessApplication(application, account, userData) {
  const status = application?.status || 'not_started';
  const editable = ['not_started', 'draft', 'rejected'].includes(status) && account?.status !== 'suspended';
  const form = $('businessApplicationForm');
  const feedback = application?.rejectionReason || application?.reviewFeedback || '';
  const labels = {not_started:'Not started', draft:'Draft', submitted:'Submitted', under_review:'Under review', approved:'Approved', rejected:'Rejected', withdrawn:'Withdrawn'};
  $('applicationStatus').innerHTML = `<h4>Application status: ${labels[status] || status}</h4>${feedback ? `<p>${String(feedback).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p>` : ''}${application?.reviewerEmail ? `<p>Reviewed by ${application.reviewerEmail}</p>` : ''}${account?.status === 'suspended' ? '<p>Your Business Account is suspended. Contact administration for review.</p>' : ''}`;
  const values = application || {};
  $('appStudioName').value = values.studioName || '';
  $('appLegalName').value = values.legalName || '';
  $('appRegistrationNumber').value = values.registrationNumber || '';
  $('appContactEmail').value = values.contactEmail || userData.email || '';
  $('appContactPhone').value = values.contactPhone || '';
  $('appWebsite').value = values.website || '';
  $('appAddress').value = values.address || '';
  $('appDescription').value = values.description || '';
  $('appEvidenceUrls').value = Array.isArray(values.evidenceUrls) ? values.evidenceUrls.join('\n') : '';
  Array.from(form.elements).forEach(element => { if (!['withdrawApplicationBtn'].includes(element.id)) element.disabled = !editable; });
  $('withdrawApplicationBtn').hidden = !['draft', 'submitted', 'under_review'].includes(status);
  if (status === 'withdrawn' || status === 'approved') form.hidden = true;
  else form.hidden = false;
}

function businessApplicationPayload() {
  return {
    studioName:$('appStudioName').value.trim(), legalName:$('appLegalName').value.trim(),
    registrationNumber:$('appRegistrationNumber').value.trim(), contactEmail:$('appContactEmail').value.trim(),
    contactPhone:$('appContactPhone').value.trim(), website:$('appWebsite').value.trim(),
    address:$('appAddress').value.trim(), description:$('appDescription').value.trim(),
    evidenceUrls:$('appEvidenceUrls').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
  };
}

async function manageApplication(operation) {
  showStatus(operation === 'submit' ? 'Submitting application…' : operation === 'withdraw' ? 'Withdrawing application…' : 'Saving application draft…');
  try {
    await callFunction('manageBusinessApplication', {operation, ...(operation === 'withdraw' ? {} : {application:businessApplicationPayload()})});
    await loadBusinessData(currentUser.uid);
    showStatus(operation === 'submit' ? 'Application submitted for review.' : operation === 'withdraw' ? 'Application withdrawn.' : 'Application draft saved.');
  } catch (error) {
    showStatus(error.message || 'Could not update the application.', true);
  }
}

async function saveProfile(status = 'published') {
  const savePublishBtn = $('savePublishBtn');
  const saveDraftBtn = $('saveDraftBtn');
  if (savePublishBtn) savePublishBtn.disabled = true;
  if (saveDraftBtn) saveDraftBtn.disabled = true;
  showStatus('Saving Business Profile…');

  const payload = {
    name: $('bizName').value.trim(),
    username: $('bizUsername').value.trim().toLowerCase(),
    industry: $('bizIndustry').value.trim(),
    logoUrl: $('bizLogoUrl').value.trim(),
    coverUrl: $('bizCoverUrl').value.trim(),
    gallery: galleryUrls,
    location: $('bizLocation').value.trim(),
    companySize: $('bizCompanySize').value,
    shortDescription: $('bizTagline').value.trim(),
    about: $('bizAbout').value.trim(),
    services: parseList($('bizServices').value),
    specializations: parseList($('bizSpecializations').value),
    website: $('bizWebsite').value.trim(),
    contactEmail: $('bizEmail').value.trim(),
    contactPhone: $('bizPhone').value.trim(),
    address: $('bizAddress').value.trim(),
    status
  };

  try {
    await callFunction('saveBusinessProfile', payload);
    showStatus(`Business Profile successfully ${status === 'published' ? 'published' : 'saved as draft'}!`);

    const previewBtn = $('previewPublicBizBtn');
    if (previewBtn) {
      previewBtn.href = `portfolio.html?id=${encodeURIComponent(currentUser.uid)}`;
      previewBtn.hidden = false;
    }
  } catch (error) {
    console.error('[BusinessBuilder] Save error:', error);
    showStatus(error.message || 'Could not save Business Profile.', true);
  } finally {
    if (savePublishBtn) savePublishBtn.disabled = false;
    if (saveDraftBtn) saveDraftBtn.disabled = false;
  }
}

// Logo File Handler
$('bizLogoFile')?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;
  const statusEl = $('logoUploadStatus');
  try {
    statusEl.textContent = 'Uploading logo…';
    const ext = file.name.split('.').pop() || 'png';
    const path = `businesses/${currentUser.uid}/logo_${Date.now()}.${ext}`;
    const url = await uploadImageToStorage(file, path);
    renderLogoPreview(url);
    statusEl.textContent = 'Logo uploaded successfully!';
    showStatus('Logo uploaded. Remember to publish changes.');
  } catch (err) {
    console.error('[BusinessBuilder] Logo upload error:', err);
    statusEl.textContent = 'Upload failed. Try again.';
    showStatus(err.message || 'Logo upload failed', true);
  }
});

// Remove Logo
$('removeLogoBtn')?.addEventListener('click', () => {
  renderLogoPreview('');
  if ($('bizLogoFile')) $('bizLogoFile').value = '';
  $('logoUploadStatus').textContent = 'Click or drag logo image here';
});

// Cover File Handler
$('bizCoverFile')?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;
  const statusEl = $('coverUploadStatus');
  try {
    statusEl.textContent = 'Uploading banner…';
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `businesses/${currentUser.uid}/cover_${Date.now()}.${ext}`;
    const url = await uploadImageToStorage(file, path);
    renderCoverPreview(url);
    statusEl.textContent = 'Banner uploaded successfully!';
    showStatus('Banner cover uploaded. Remember to publish changes.');
  } catch (err) {
    console.error('[BusinessBuilder] Cover upload error:', err);
    statusEl.textContent = 'Upload failed. Try again.';
    showStatus(err.message || 'Cover upload failed', true);
  }
});

// Remove Cover
$('removeCoverBtn')?.addEventListener('click', () => {
  renderCoverPreview('');
  if ($('bizCoverFile')) $('bizCoverFile').value = '';
  $('coverUploadStatus').textContent = 'Click or drag banner image here';
});

// Gallery Files Handler
$('bizGalleryFiles')?.addEventListener('change', async event => {
  const files = Array.from(event.target.files || []);
  if (!files.length || !currentUser) return;
  const statusEl = $('galleryUploadStatus');
  statusEl.textContent = `Uploading ${files.length} photo(s)…`;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `businesses/${currentUser.uid}/gallery/${Date.now()}_${i}.${ext}`;
      const url = await uploadImageToStorage(file, path);
      galleryUrls.push(url);
      renderGalleryGrid();
    }
    statusEl.textContent = 'Gallery photos uploaded successfully!';
    showStatus('Gallery photos uploaded. Remember to publish changes.');
  } catch (err) {
    console.error('[BusinessBuilder] Gallery upload error:', err);
    statusEl.textContent = 'Some uploads failed. Try again.';
    showStatus(err.message || 'Gallery upload failed', true);
  }
});

$('bizProfileForm')?.addEventListener('submit', event => {
  event.preventDefault();
  saveProfile('published');
});

$('saveDraftBtn')?.addEventListener('click', () => {
  saveProfile('draft');
});

$('businessApplicationForm')?.addEventListener('submit', event => { event.preventDefault(); manageApplication('submit'); });
$('saveApplicationDraftBtn')?.addEventListener('click', () => manageApplication('save_draft'));
$('withdrawApplicationBtn')?.addEventListener('click', () => { if (confirm('Withdraw this Business Status application?')) manageApplication('withdraw'); });

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (!user) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
    return;
  }
  loadBusinessData(user.uid);
});
