import {auth, db} from './platform-client.js';
import {canManage, getAdminAccess, normalizeEmail} from './rbac.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where} from '/js/cloudflare-client.js';

const FALLBACK_IMAGE = 'static/images/branding/LOGO.png';
const ADMIN_DASHBOARD_URL = 'https://aiasbsr.com/admin-dashboard.html';
const MARKET_ACCESS_PASSWORD = 'aias-market';
const MARKET_ACCESS_KEY = 'aiasMarketDevelopmentAccess';
const byId = id => document.getElementById(id);
const text = value => String(value ?? '').trim();
const loginUrl = () => `login.html?next=${encodeURIComponent(`market.html${window.location.search}`)}`;

let allStores = [];
let allItems = [];
let marketTypes = [];
let marketTags = [];
let activeUser = null;
let currentTab = 'items';
let activeTag = 'all';
let currentItem = null;
let lastFocusedElement = null;

function hasMarketAccess() {
  try {
    return sessionStorage.getItem(MARKET_ACCESS_KEY) === 'granted';
  } catch {
    return false;
  }
}

function unlockMarketAccess() {
  try {
    sessionStorage.setItem(MARKET_ACCESS_KEY, 'granted');
  } catch {}
  document.body.classList.remove('market-locked');
  byId('marketDevGate')?.setAttribute('hidden', '');
  const liveContent = byId('marketLiveContent');
  if (liveContent) liveContent.setAttribute('aria-hidden', 'false');
}

function setupMarketDevelopmentGate() {
  if (hasMarketAccess()) {
    unlockMarketAccess();
    return true;
  }
  const form = byId('marketDevAccessForm');
  const input = byId('marketDevPassword');
  const status = byId('marketDevStatus');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (text(input?.value) === MARKET_ACCESS_PASSWORD) {
      unlockMarketAccess();
      initializeMarket().catch(error => {
        console.error('Error initializing marketplace.', error);
      });
      return;
    }
    if (status) status.textContent = 'Wrong password. Please try again.';
    input?.focus();
    input?.select?.();
  });
  input?.focus();
  return false;
}

function makeElement(tag, className = '', content = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== '') node.textContent = text(content);
  return node;
}

function safeMediaUrl(value) {
  const candidate = text(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate, window.location.origin);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return url.protocol === 'https:' || localHttp || (url.origin === window.location.origin && url.protocol === window.location.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function setSafeImage(image, source, alt) {
  image.alt = text(alt);
  image.src = safeMediaUrl(source) || FALLBACK_IMAGE;
  image.addEventListener('error', () => {
    if (!image.src.endsWith(FALLBACK_IMAGE)) image.src = FALLBACK_IMAGE;
  }, {once: true});
}

function timestampSeconds(value) {
  if (typeof value?.seconds === 'number') return value.seconds;
  if (typeof value?.toMillis === 'function') return value.toMillis() / 1000;
  return 0;
}

function renderEmpty(container, icon, title, description) {
  const state = makeElement('div', 'market-empty-state');
  state.append(makeElement('span', '', icon), makeElement('h3', '', title), makeElement('p', '', description));
  container.replaceChildren(state);
}

function currentSearch() {
  return text(byId('marketMainSearch')?.value).toLocaleLowerCase();
}

function updateUrlState() {
  const url = new URL(window.location.href);
  const queryValue = text(byId('marketMainSearch')?.value);
  queryValue ? url.searchParams.set('q', queryValue) : url.searchParams.delete('q');
  currentTab === 'stores' ? url.searchParams.set('tab', 'stores') : url.searchParams.delete('tab');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function openCommunityMarketShare(kind, id) {
  const safeKind = kind === 'store' ? 'store' : 'item';
  const safeId = text(id);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(safeId)) return;
  window.location.assign(`/community.html?view=post&marketKind=${safeKind}&marketId=${encodeURIComponent(safeId)}`);
}

function createCommunityShareButton(kind, id, label = 'Share to Community') {
  const button = makeElement('button', 'market-community-share', `↗ ${label}`);
  button.type = 'button';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openCommunityMarketShare(kind, id);
  });
  return button;
}

function updateResultsSummary(count) {
  const label = currentTab === 'items' ? 'item' : 'store';
  byId('marketResultsSummary').textContent = `${count} ${label}${count === 1 ? '' : 's'} shown`;
  const hasFilters = Boolean(currentSearch() || activeTag !== 'all' || byId('marketTypeFilter')?.value || byId('marketSortSelect')?.value !== 'newest');
  byId('marketClearFilters').hidden = !hasFilters;
}

function populateMarketTypeFilter(types) {
  const select = byId('marketTypeFilter');
  const current = select.value;
  const options = [new Option('All Types', '')];
  types.forEach(entry => {
    const english = text(entry?.en || entry);
    if (!english) return;
    const arabic = text(entry?.ar);
    options.push(new Option(arabic ? `${english} (${arabic})` : english, english));
  });
  select.replaceChildren(...options);
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function renderTagFilters(tags) {
  const container = byId('marketTagFilters');
  const uniqueTags = [...new Set(tags.map(entry => text(entry?.en || entry)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (activeTag !== 'all' && !uniqueTags.includes(activeTag)) activeTag = 'all';
  const buttons = ['all', ...uniqueTags].map(tag => {
    const button = makeElement('button', `market-tag-pill${activeTag === tag ? ' active' : ''}`, tag === 'all' ? 'All Tags' : tag);
    button.type = 'button';
    button.dataset.tag = tag;
    button.setAttribute('aria-pressed', String(activeTag === tag));
    button.addEventListener('click', () => {
      activeTag = tag;
      renderTagFilters(uniqueTags);
      renderItems();
    });
    return button;
  });
  container.replaceChildren(...buttons);
}

async function loadMarketTaxonomy() {
  try {
    const [typesSnap, tagsSnap] = await Promise.all([
      getDoc(doc(db, 'config', 'marketTypes')),
      getDoc(doc(db, 'config', 'marketTags'))
    ]);
    marketTypes = typesSnap.exists() && Array.isArray(typesSnap.data().types) ? typesSnap.data().types : [];
    marketTags = tagsSnap.exists() && Array.isArray(tagsSnap.data().tags) ? tagsSnap.data().tags : [];
    populateMarketTypeFilter(marketTypes);
    renderTagFilters(marketTags);
  } catch (error) {
    console.warn('Could not load marketplace taxonomy.', error);
    marketTypes = [];
    marketTags = [];
    populateMarketTypeFilter([]);
    renderTagFilters([]);
  }
}

function createItemCard(item, storeMap) {
  const storeName = text(storeMap[item.storeId] || item.storeName) || 'AIAS Store';
  const article = makeElement('article', 'market-item-card');
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-label', `View ${text(item.name) || 'marketplace item'}`);

  const thumbnail = makeElement('div', 'market-item-thumb-box');
  const image = document.createElement('img');
  image.loading = 'lazy';
  image.decoding = 'async';
  setSafeImage(image, item.imageUrl, text(item.name) || 'Marketplace item');
  const badges = makeElement('div', 'market-item-top-tags');
  badges.append(makeElement('span', 'market-tag-badge', text(item.tag) || 'General'), makeElement('span', 'market-type-badge', text(item.type) || 'Asset'));
  thumbnail.append(image, badges);

  const body = makeElement('div', 'market-item-body');
  const storeLink = makeElement('a', 'market-item-store-link');
  storeLink.href = `store.html?id=${encodeURIComponent(text(item.storeId))}`;
  storeLink.append(makeElement('span', '', `🏬 ${storeName}`));
  const title = makeElement('h3', 'market-item-title', text(item.name) || 'Untitled item');
  const meta = makeElement('div', 'market-item-meta');
  meta.append(
    makeElement('span', 'market-item-delivery', `⚡ ${text(item.deliverTime) || 'Contact store'}`),
    makeElement('span', '', `Qty: ${item.quantity !== undefined ? item.quantity : 'Unlimited'}`)
  );
  body.append(storeLink, title, meta, createCommunityShareButton('item', item.id));
  article.append(thumbnail, body);

  article.addEventListener('click', event => {
    if (!event.target.closest('a,button')) openMarketItemModal(item.id);
  });
  article.addEventListener('keydown', event => {
    if (event.target !== article) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMarketItemModal(item.id);
    }
  });
  return article;
}

function renderItems() {
  const container = byId('marketItemsGrid');
  const search = currentSearch();
  const typeFilter = byId('marketTypeFilter')?.value || '';
  const sortValue = byId('marketSortSelect')?.value || 'newest';
  const storeMap = Object.fromEntries(allStores.map(store => [store.id, text(store.name)]));

  const filtered = allItems.filter(item => {
    if (activeTag !== 'all' && text(item.tag) !== activeTag) return false;
    if (typeFilter && text(item.type) !== typeFilter) return false;
    if (!search) return true;
    return [item.name, item.description, item.tag, item.type, storeMap[item.storeId]].some(value => text(value).toLocaleLowerCase().includes(search));
  });
  filtered.sort((a, b) => {
    if (sortValue === 'alpha') return text(a.name).localeCompare(text(b.name));
    if (sortValue === 'oldest') return timestampSeconds(a.createdAt) - timestampSeconds(b.createdAt);
    return timestampSeconds(b.createdAt) - timestampSeconds(a.createdAt);
  });

  updateResultsSummary(filtered.length);
  updateUrlState();
  if (!filtered.length) {
    renderEmpty(container, '📦', 'No marketplace items found', 'Try a different keyword or clear the filters.');
    return;
  }
  container.replaceChildren(...filtered.map(item => createItemCard(item, storeMap)));
}

function createStoreCard(store) {
  const card = makeElement('article', 'market-store-card');
  const storeUrl = `store.html?id=${encodeURIComponent(text(store.id))}`;
  const banner = makeElement('div', 'market-store-header-banner');
  const bannerUrl = safeMediaUrl(store.bannerImage);
  if (bannerUrl) banner.style.backgroundImage = `url(${JSON.stringify(bannerUrl)})`;

  const logo = makeElement('img', 'market-store-avatar');
  logo.loading = 'lazy';
  logo.decoding = 'async';
  setSafeImage(logo, store.profileImage, `${text(store.name) || 'Store'} logo`);
  banner.append(logo);

  const body = makeElement('div', 'market-store-body');
  const nameRow = makeElement('div', 'market-store-name-row');
  nameRow.append(makeElement('h3', 'market-store-name', text(store.name) || 'Unnamed store'));
  if (store.verified === true) {
    const verified = makeElement('span', '', '✓ Verified');
    verified.style.cssText = 'color:#166534;font-size:.7rem;font-weight:800;';
    nameRow.append(verified);
  }
  const bio = makeElement('div', 'market-store-bio', text(store.bio) || 'Architectural store on AIAS Basra.');
  const footer = makeElement('div', 'market-store-footer');
  const itemCount = allItems.filter(item => item.storeId === store.id).length;
  const actions = makeElement('span', 'market-store-actions');
  const visit = makeElement('a', 'market-store-visit', 'Visit Store ↗');
  visit.href = storeUrl;
  actions.append(visit, createCommunityShareButton('store', store.id, 'Share'));
  footer.append(makeElement('span', '', `🛍️ ${itemCount} item${itemCount === 1 ? '' : 's'}`), actions);
  body.append(nameRow, bio, footer);
  card.append(banner, body);
  return card;
}

function renderStores() {
  const container = byId('marketStoresGrid');
  const search = currentSearch();
  const filtered = allStores.filter(store => !search || [store.name, store.bio].some(value => text(value).toLocaleLowerCase().includes(search)));
  filtered.sort((a, b) => text(a.name).localeCompare(text(b.name)));
  updateResultsSummary(filtered.length);
  updateUrlState();
  if (!filtered.length) {
    renderEmpty(container, '🏬', 'No registered stores found', 'Try a different search keyword.');
    return;
  }
  container.replaceChildren(...filtered.map(createStoreCard));
}

async function updateManageAccess() {
  const manageButton = byId('manageMarketBtn');
  manageButton.style.display = 'none';
  if (!activeUser) return;
  const userEmail = normalizeEmail(activeUser.email);
  const assignedStores = allStores.filter(store => {
    const emails = [...(Array.isArray(store.adminEmails) ? store.adminEmails : []), ...(Array.isArray(store.storeAdmins) ? store.storeAdmins : [])].map(normalizeEmail);
    const uids = [...(Array.isArray(store.adminUids) ? store.adminUids : []), store.ownerUid, store.createdBy].filter(Boolean);
    return emails.includes(userEmail) || uids.includes(activeUser.uid);
  });
  if (assignedStores.length) {
    manageButton.href = `store-manage.html?id=${encodeURIComponent(assignedStores[0].id)}`;
    manageButton.querySelector('span').textContent = assignedStores.length === 1 ? '⚙️ Manage Store' : `⚙️ Manage Stores (${assignedStores.length})`;
    manageButton.style.display = 'inline-flex';
    return;
  }
  try {
    const access = await getAdminAccess(db, activeUser.email);
    if (canManage(access, 'market')) {
      manageButton.href = ADMIN_DASHBOARD_URL;
      manageButton.querySelector('span').textContent = '⚙️ Manage Market';
      manageButton.style.display = 'inline-flex';
    }
  } catch (error) {
    console.warn('Could not confirm marketplace management access.', error);
  }
}

function switchMarketTab(tab) {
  currentTab = tab === 'stores' ? 'stores' : 'items';
  const showItems = currentTab === 'items';
  byId('tabItemsBtn').classList.toggle('active', showItems);
  byId('tabStoresBtn').classList.toggle('active', !showItems);
  byId('tabItemsBtn').setAttribute('aria-selected', String(showItems));
  byId('tabStoresBtn').setAttribute('aria-selected', String(!showItems));
  byId('itemsSection').hidden = !showItems;
  byId('storesSection').hidden = showItems;
  byId('itemsFilterBar').hidden = !showItems;
  showItems ? renderItems() : renderStores();
}

function updateOrderAvailability() {
  const notice = byId('marketOrderAuthNotice');
  const form = byId('marketOrderForm');
  const soldOut = currentItem && Number(currentItem.quantity) === 0;
  const canOrder = Boolean(activeUser && !soldOut);
  [...form.elements].forEach(control => {
    if (control.type !== 'hidden') control.disabled = !canOrder;
  });
  notice.hidden = canOrder;
  notice.replaceChildren();
  if (soldOut) {
    notice.textContent = 'This item is currently out of stock.';
  } else if (!activeUser) {
    notice.append('Please ', Object.assign(document.createElement('a'), {href: loginUrl(), textContent: 'sign in'}), ' before sending an order request.');
  }
}

function openMarketItemModal(itemId) {
  const item = allItems.find(entry => entry.id === itemId);
  if (!item) return;
  currentItem = item;
  lastFocusedElement = document.activeElement;
  const store = allStores.find(entry => entry.id === item.storeId);
  const storeName = text(store?.name || item.storeName) || 'AIAS Store';
  byId('modalItemTitle').textContent = text(item.name) || 'Untitled item';
  byId('modalItemDesc').textContent = text(item.description) || 'No description provided.';
  byId('modalItemTag').textContent = text(item.tag) || 'General';
  byId('modalItemType').textContent = text(item.type) || 'Digital Asset';
  byId('modalItemQty').textContent = `Quantity: ${item.quantity !== undefined ? item.quantity : 'Unlimited'}`;
  byId('modalItemDelivery').textContent = `⚡ Delivery: ${text(item.deliverTime) || 'Contact store'}`;
  setSafeImage(byId('modalItemImage'), item.imageUrl, text(item.name) || 'Marketplace item');
  byId('modalItemStoreName').textContent = storeName;
  byId('modalItemStoreLink').href = `store.html?id=${encodeURIComponent(text(item.storeId))}`;
  byId('modalOrderItemId').value = item.id;
  byId('modalOrderStoreId').value = text(item.storeId);
  byId('marketOrderStatus').textContent = '';
  byId('marketOrderNotes').value = '';
  const url = new URL(location.href);
  url.searchParams.set('item', item.id);
  history.replaceState({}, '', url.pathname + url.search + url.hash);
  if (activeUser) {
    byId('marketBuyerName').value = text(activeUser.displayName);
    byId('marketBuyerContact').value = text(activeUser.email);
  }
  updateOrderAvailability();
  const modal = byId('marketItemModal');
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
  document.body.classList.add('market-modal-open');
  byId('marketModalClose').focus();
}

function closeMarketItemModal() {
  const modal = byId('marketItemModal');
  modal.classList.remove('is-open');
  document.body.classList.remove('market-modal-open');
  window.setTimeout(() => { modal.hidden = true; }, 220);
  currentItem = null;
  const url = new URL(location.href);
  url.searchParams.delete('item');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
  lastFocusedElement?.focus?.();
}

function updateAuthUI(user) {
  const container = byId('authContainer');
  container.replaceChildren();
  if (user) {
    const avatar = makeElement('div', 'topbar-avatar', (text(user.displayName || user.email) || 'U').charAt(0).toUpperCase());
    avatar.title = text(user.email);
    avatar.setAttribute('aria-label', `Signed in as ${text(user.displayName || user.email)}`);
    container.append(avatar);
  } else {
    const link = makeElement('a', 'btn-primary', 'Sign in');
    link.href = loginUrl();
    link.style.cssText = 'padding:6px 14px;font-size:.76rem;';
    container.append(link);
  }
  updateOrderAvailability();
  updateManageAccess();
}

async function loadMarketData() {
  try {
    const [storesSnapshot, itemsSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'marketStores'), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'marketItems'), where('status', '==', 'active')))
    ]);
    allStores = storesSnapshot.docs.map(snapshot => ({id: snapshot.id, ...snapshot.data()}));
    allItems = itemsSnapshot.docs.map(snapshot => ({id: snapshot.id, ...snapshot.data()}));
    byId('statStoresCount').textContent = allStores.length;
    byId('statItemsCount').textContent = allItems.length;
    const itemTags = allItems.map(item => item.tag);
    renderTagFilters([...marketTags, ...itemTags]);
    currentTab === 'items' ? renderItems() : renderStores();
    updateManageAccess();
  } catch (error) {
    console.error('Error loading marketplace data.', error);
    renderEmpty(byId('marketItemsGrid'), '⚠️', 'Marketplace unavailable', 'Please check your connection and try again.');
    byId('marketResultsSummary').textContent = 'Could not load marketplace results';
  }
}

byId('tabItemsBtn').addEventListener('click', () => switchMarketTab('items'));
byId('tabStoresBtn').addEventListener('click', () => switchMarketTab('stores'));
byId('marketModalClose').addEventListener('click', closeMarketItemModal);
byId('marketShareItemBtn').addEventListener('click', () => {
  if (currentItem) openCommunityMarketShare('item', currentItem.id);
});
byId('marketItemModal').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeMarketItemModal();
});
byId('marketItemModal').addEventListener('keydown', event => {
  if (event.key === 'Escape') return closeMarketItemModal();
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

byId('marketMainSearch').addEventListener('input', () => currentTab === 'items' ? renderItems() : renderStores());
byId('marketQuickSearch').addEventListener('input', event => {
  byId('marketMainSearch').value = event.target.value;
  currentTab === 'items' ? renderItems() : renderStores();
});
byId('marketTypeFilter').addEventListener('change', renderItems);
byId('marketSortSelect').addEventListener('change', renderItems);
byId('marketClearFilters').addEventListener('click', () => {
  byId('marketMainSearch').value = '';
  byId('marketQuickSearch').value = '';
  byId('marketTypeFilter').value = '';
  byId('marketSortSelect').value = 'newest';
  activeTag = 'all';
  renderTagFilters([...marketTags, ...allItems.map(item => item.tag)]);
  currentTab === 'items' ? renderItems() : renderStores();
});

byId('marketOrderForm').addEventListener('submit', async event => {
  event.preventDefault();
  const status = byId('marketOrderStatus');
  const submit = byId('marketOrderSubmitBtn');
  if (!activeUser || !currentItem) {
    status.style.color = '#991b1b';
    status.textContent = 'Please sign in before submitting an order request.';
    return;
  }
  const buyerName = text(byId('marketBuyerName').value).slice(0, 120);
  const buyerContact = text(byId('marketBuyerContact').value).slice(0, 160);
  const notes = text(byId('marketOrderNotes').value).slice(0, 1000);
  if (!buyerName || !buyerContact) return;
  submit.disabled = true;
  submit.textContent = 'Submitting Request…';
  try {
    await addDoc(collection(db, 'marketOrders'), {
      itemId: currentItem.id,
      storeId: text(currentItem.storeId),
      buyerUid: activeUser.uid,
      buyerEmail: normalizeEmail(activeUser.email),
      buyerName,
      buyerContact,
      notes,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    status.style.color = '#166534';
    status.textContent = '✓ Request received. The store owner will contact you shortly.';
    byId('marketOrderNotes').value = '';
    window.setTimeout(closeMarketItemModal, 1800);
  } catch (error) {
    console.error('Order submission failed.', error);
    status.style.color = '#991b1b';
    status.textContent = 'Could not submit your request. Please try again.';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Submit Order Request';
  }
});

const initialParams = new URLSearchParams(window.location.search);
const initialQuery = text(initialParams.get('q'));
const initialItemId = text(initialParams.get('item'));

async function initializeMarket() {
  byId('marketMainSearch').value = initialQuery;
  byId('marketQuickSearch').value = initialQuery;
  currentTab = initialParams.get('tab') === 'stores' ? 'stores' : 'items';
  switchMarketTab(currentTab);
  onAuthStateChanged(auth, user => {
    activeUser = user;
    updateAuthUI(user);
  });
  await loadMarketTaxonomy();
  await loadMarketData();
  if (initialItemId && allItems.some(item => item.id === initialItemId)) {
    switchMarketTab('items');
    openMarketItemModal(initialItemId);
  } else if (initialItemId) {
    switchMarketTab('items');
    renderEmpty(byId('marketItemsGrid'), '⌁', 'This shared item is unavailable', 'It may have been removed, hidden, or sold out by its store.');
    byId('marketResultsSummary').textContent = 'Shared item unavailable';
  }
}

if (setupMarketDevelopmentGate()) await initializeMarket();
