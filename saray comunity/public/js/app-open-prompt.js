(function () {
  'use strict';

  const DISMISS_KEY = 'aias_app_prompt_dismissed';
  const APP_PACKAGE = 'com.aiasbsr.community';
  const PRODUCTION_ORIGIN = 'https://space-42d87.web.app';
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const mobileViewport = window.matchMedia?.('(max-width: 699px)');

  if (!isAndroid || isStandalone || !mobileViewport?.matches || document.getElementById('aiasAppPrompt')) return;
  try { if (sessionStorage.getItem(DISMISS_KEY) === '1') return; } catch {}

  let storedLanguage = '';
  try { storedLanguage = localStorage.getItem('language') || ''; } catch {}
  const isArabic = document.documentElement.dir === 'rtl' || document.documentElement.lang?.toLowerCase().startsWith('ar') || storedLanguage === 'ar';
  const copy = isArabic
    ? { title:'فتح تطبيق AIAS Basra؟', body:'تابع مجتمع AIAS البصرة في التطبيق.', open:'فتح التطبيق', stay:'المتابعة في الموقع', label:'فتح تطبيق AIAS Basra' }
    : { title:'Open the AIAS Basra app?', body:'Continue in the AIAS Basra Community app.', open:'Open app', stay:'Continue on website', label:'Open the AIAS Basra app' };

  const style = document.createElement('style');
  style.textContent = `
    .aias-app-prompt[hidden]{display:none!important}
    .aias-app-prompt{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(22,14,16,.46);font-family:Inter,"DM Sans",Arial,sans-serif;backdrop-filter:blur(3px)}
    .aias-app-prompt__card{width:min(100%,440px);display:grid;grid-template-columns:54px minmax(0,1fr);gap:13px;padding:17px;border:1px solid rgba(102,31,34,.13);border-radius:22px;background:#fffdfa;box-shadow:0 24px 70px rgba(46,19,23,.28);animation:aiasAppPromptIn .22s ease both}
    .aias-app-prompt__logo{width:54px;height:54px;object-fit:cover;border-radius:16px;background:#f2ece6}
    .aias-app-prompt__copy{min-width:0}.aias-app-prompt__copy strong,.aias-app-prompt__copy span{display:block}.aias-app-prompt__copy strong{color:#321c22;font-size:.98rem;line-height:1.3}.aias-app-prompt__copy span{margin-top:4px;color:#74696b;font-size:.76rem;line-height:1.45}
    .aias-app-prompt__actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px}.aias-app-prompt__actions button{min-height:46px;border-radius:13px;padding:0 12px;font:800 .76rem/1 Inter,"DM Sans",Arial,sans-serif;cursor:pointer}.aias-app-prompt__open{border:0;color:#fff;background:linear-gradient(135deg,#50191d,#7d3431)}.aias-app-prompt__stay{border:1px solid #d9ccc5;color:#5d2529;background:#fff}
    @keyframes aiasAppPromptIn{from{opacity:0;transform:translateY(18px)}}
    @media(min-width:700px){.aias-app-prompt{display:none!important}}
    @media(prefers-reduced-motion:reduce){.aias-app-prompt__card{animation:none}}
  `;
  document.head.appendChild(style);

  const prompt = document.createElement('div');
  prompt.id = 'aiasAppPrompt';
  prompt.className = 'aias-app-prompt';
  prompt.hidden = true;
  prompt.setAttribute('role', 'dialog');
  prompt.setAttribute('aria-modal', 'true');
  prompt.setAttribute('aria-label', copy.label);
  prompt.innerHTML = `
    <section class="aias-app-prompt__card">
      <img class="aias-app-prompt__logo" src="/static/images/branding/LOGO.png" alt="">
      <div class="aias-app-prompt__copy"><strong>${copy.title}</strong><span>${copy.body}</span></div>
      <div class="aias-app-prompt__actions"><button class="aias-app-prompt__open" type="button">${copy.open}</button><button class="aias-app-prompt__stay" type="button">${copy.stay}</button></div>
    </section>`;
  document.body.appendChild(prompt);
  const previousBodyOverflow = document.body.style.overflow;

  function dismiss() {
    prompt.hidden = true;
    document.body.style.overflow = previousBodyOverflow;
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  function appTarget() {
    const appPath = /^\/(?:project(?:\.html)?|a\/|p\/)/i.test(location.pathname) || location.pathname === '/'
      ? location.pathname + location.search
      : '/';
    return new URL(appPath, PRODUCTION_ORIGIN);
  }

  function openApp() {
    const target = appTarget();
    const fallback = encodeURIComponent(location.href);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
    location.href = `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }

  prompt.querySelector('.aias-app-prompt__open').addEventListener('click', openApp);
  prompt.querySelector('.aias-app-prompt__stay').addEventListener('click', dismiss);
  prompt.addEventListener('click', event => { if (event.target === prompt) dismiss(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !prompt.hidden) dismiss(); });
  mobileViewport.addEventListener?.('change', event => { if (!event.matches && !prompt.hidden) dismiss(); });

  window.setTimeout(() => {
    prompt.hidden = false;
    document.body.style.overflow = 'hidden';
    prompt.querySelector('.aias-app-prompt__open').focus({preventScroll:true});
  }, 500);
})();
