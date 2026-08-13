(function () {
  'use strict';

  const DOWNLOAD_PAGE_URL = '/download.html';
  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobileViewport = window.matchMedia?.('(max-width: 699px)');
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

  // The card is intentionally limited to Android and iOS phones/tablets.
  if ((!isAndroid && !isIOS) || !mobileViewport?.matches || isStandalone || document.getElementById('aiasMobileAppCard')) return;

  let storedLanguage = '';
  try { storedLanguage = localStorage.getItem('language') || ''; } catch {}
  const isArabic = document.documentElement.dir === 'rtl' || document.documentElement.lang?.toLowerCase().startsWith('ar') || storedLanguage === 'ar';
  const copy = isAndroid
    ? (isArabic
      ? {eyebrow:'تطبيق AIAS BASRA', title:'استخدم تطبيق المجتمع', body:'نزّل نسخة أندرويد للوصول إلى مجتمع AIAS البصرة من هاتفك.', action:'صفحة التنزيل', label:'فتح صفحة تنزيل تطبيق AIAS Basra لأندرويد'}
      : {eyebrow:'AIAS BASRA APP', title:'Use the Community mobile app', body:'Download the Android beta and access AIAS Basra Community from your phone.', action:'Download page', label:'Open the AIAS Basra Android download page'})
    : (isArabic
      ? {eyebrow:'تطبيق AIAS BASRA', title:'نسخة iOS قريباً', body:'نعمل على تجهيز تطبيق مجتمع AIAS البصرة لأجهزة iPhone وiPad.', action:'قريباً', label:'تطبيق iOS قريباً'}
      : {eyebrow:'AIAS BASRA APP', title:'iOS app coming soon', body:'We are preparing the AIAS Basra Community app for iPhone and iPad.', action:'Coming soon', label:'AIAS Basra iOS app coming soon'});

  const style = document.createElement('style');
  style.textContent = `
    .aias-mobile-app-card[hidden]{display:none!important}
    .aias-mobile-app-card{position:relative;z-index:49;width:min(100%,1460px);margin:0 auto;padding:10px 28px 0;font-family:"DM Sans",Arial,sans-serif}
    .aias-mobile-app-card__inner{position:relative;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 44px 12px 13px;border:1px solid rgba(240,218,161,.3);border-radius:18px;color:#fff;background:linear-gradient(125deg,#3d1115,#661f22 62%,#945c50);box-shadow:0 12px 28px rgba(61,17,21,.16)}
    .aias-mobile-app-card__logo{width:46px;height:46px;object-fit:cover;border-radius:13px;background:#fffdfa}
    .aias-mobile-app-card__copy{min-width:0}.aias-mobile-app-card__copy small,.aias-mobile-app-card__copy strong,.aias-mobile-app-card__copy span{display:block}.aias-mobile-app-card__copy small{color:#f0daa1;font-size:.52rem;font-weight:800;letter-spacing:.13em}.aias-mobile-app-card__copy strong{margin-top:2px;font:800 .9rem/1.25 Manrope,"DM Sans",Arial,sans-serif}.aias-mobile-app-card__copy span{margin-top:2px;color:rgba(255,255,255,.67);font-size:.65rem;line-height:1.35}
    .aias-mobile-app-card__action{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 13px;border:0;border-radius:11px;color:#661f22;background:#f0daa1;text-decoration:none;font-size:.68rem;font-weight:800;white-space:nowrap}.aias-mobile-app-card__action[aria-disabled="true"]{opacity:.72;cursor:default}
    .aias-mobile-app-card__close{position:absolute;top:8px;right:8px;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:50%;color:rgba(255,255,255,.72);background:transparent;cursor:pointer;font-size:1rem}
    html[dir="rtl"] .aias-mobile-app-card__close{right:auto;left:8px}
    @media(min-width:700px){.aias-mobile-app-card{display:none!important}}
    @media(max-width:480px){.aias-mobile-app-card{padding:8px 10px 0}.aias-mobile-app-card__inner{grid-template-columns:42px minmax(0,1fr);gap:10px;padding:11px 38px 11px 11px}.aias-mobile-app-card__logo{width:42px;height:42px}.aias-mobile-app-card__action{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);

  const card = document.createElement('aside');
  card.id = 'aiasMobileAppCard';
  card.className = 'aias-mobile-app-card';
  card.setAttribute('aria-label', copy.label);
  card.innerHTML = `<div class="aias-mobile-app-card__inner">
    <img class="aias-mobile-app-card__logo" src="/static/images/branding/LOGO.png" alt="">
    <div class="aias-mobile-app-card__copy"><small>${copy.eyebrow}</small><strong>${copy.title}</strong><span>${copy.body}</span></div>
    ${isAndroid ? `<a class="aias-mobile-app-card__action" href="${DOWNLOAD_PAGE_URL}"><span>${copy.action}</span><b aria-hidden="true">→</b></a>` : `<a class="aias-mobile-app-card__action" href="${DOWNLOAD_PAGE_URL}">${copy.action}</a>`}
    <button class="aias-mobile-app-card__close" type="button" aria-label="${isArabic ? 'إخفاء' : 'Dismiss'}">×</button>
  </div>`;

  const header = document.querySelector('.community-topbar');
  if (header) header.insertAdjacentElement('afterend', card);
  else document.body.prepend(card);

  function dismiss() {
    card.hidden = true;
  }

  card.querySelector('.aias-mobile-app-card__close').addEventListener('click', dismiss);
  mobileViewport.addEventListener?.('change', event => { if (!event.matches) dismiss(); });
})();
