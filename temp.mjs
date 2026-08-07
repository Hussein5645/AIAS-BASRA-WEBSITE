
    /*************************************************
     * تهيئة Firebase و FirestoreAPI
     *************************************************/
    import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
    import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
    import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
    import FirestoreAPI from "./js/firestore-api.js";
    import categoriesLoader from "./js/categories-loader.js";

    const firebaseConfig = {
      apiKey: "AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ",
      authDomain: "aias-bsr.firebaseapp.com",
      projectId: "aias-bsr",
      storageBucket: "aias-bsr.firebasestorage.app",
      messagingSenderId: "78055223814",
      appId: "1:78055223814:web:99460402c2b1fcd5ae8987",
      measurementId: "G-6W50T4HXDV"
    };

    let app;
    try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
    const auth = getAuth(app);
    const db = getFirestore(app);
    const firestoreAPI = new FirestoreAPI();

    let CACHE = { events: [], articles: [], library: [], models3d: [], courses: [], fbdEvents: [] };

    /*************************************************
     * تنقل التبويبات
     *************************************************/
    const mainNav = document.getElementById('mainNav');
    mainNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showTab(tab);
    });

    document.getElementById('expandAll').addEventListener('click', () => {
      document.querySelectorAll('.tab-content.active details.accordion').forEach(d => d.open = true);
    });
    document.getElementById('collapseAll').addEventListener('click', () => {
      document.querySelectorAll('.tab-content.active details.accordion').forEach(d => d.open = false);
    });

    /*************************************************
     * تسجيل خروج
     *************************************************/
    window.logout = async function() {
      try {
        await signOut(auth);
        ['aias_authenticated','aias_user_email','aias_user_name','aias_user_picture','aias_is_admin','aias_user_uid']
          .forEach(localStorage.removeItem.bind(localStorage));
        window.location.href = 'login.html';
      } catch (error) {
        console.error('Logout error:', error);
        alert('Error signing out. Please try again.');
      }
    };

    async function checkIfAdmin(email) {
      try {
        const adminDoc = await getDoc(doc(db, 'config', 'admins'));
        if (adminDoc.exists()) {
          const data = adminDoc.data();
            return Array.isArray(data.admins) && data.admins.includes(email.toLowerCase());
        }
      } catch (error) { console.error('Error checking admin status:', error); }
      return false;
    }

    (function() {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const isAdmin = await checkIfAdmin(user.email);
          localStorage.setItem('aias_authenticated','true');
          localStorage.setItem('aias_user_email', user.email);
          localStorage.setItem('aias_user_name', user.displayName || 'Admin');
          localStorage.setItem('aias_user_picture', user.photoURL || '');
          localStorage.setItem('aias_is_admin', isAdmin ? 'true' : 'false');
          localStorage.setItem('aias_user_uid', user.uid);
        } else {
          ['aias_authenticated','aias_user_email','aias_user_name','aias_user_picture','aias_is_admin','aias_user_uid']
            .forEach(localStorage.removeItem.bind(localStorage));
        }
        document.getElementById('currentLang').textContent = (localStorage.getItem('language') || 'EN').toUpperCase();
        
        // Populate category dropdowns from JSON
        await populateCategoryDropdowns();
        
        // Add language toggle event listener to re-populate categories
        const langToggle = document.getElementById('languageToggle');
        if (langToggle) {
          langToggle.addEventListener('click', async () => {
            // Wait a bit for main.js to update the language
            setTimeout(async () => {
              await populateCategoryDropdowns();
            }, 100);
          });
        }
        
        showTab('events'); // default
      });
    })();

    /*************************************************
     * تحميل الفئات من JSON
     *************************************************/
    async function populateCategoryDropdowns() {
      try {
        console.log('[Admin Dashboard] Loading categories from JSON...');
        
        // Get current language
        const currentLang = localStorage.getItem('language') || 'en';
        
        // Load event types
        const eventTypes = await categoriesLoader.getEventTypes();
        const eventTypeSelect = document.getElementById('eventType');
        const fbdEventTypeSelect = document.getElementById('fbdEventType');
        
        if (eventTypeSelect) {
          const currentValue = eventTypeSelect.value;
          eventTypeSelect.innerHTML = eventTypes.map(type => {
            // Handle both old format (string) and new format (object with en/ar)
            const value = typeof type === 'string' ? type : type.en;
            const label = typeof type === 'string' ? type : (currentLang === 'ar' ? type.ar : type.en);
            return `<option value="${value}">${label}</option>`;
          }).join('');
          if (currentValue) eventTypeSelect.value = currentValue;
        }
        
        if (fbdEventTypeSelect) {
          const currentValue = fbdEventTypeSelect.value;
          fbdEventTypeSelect.innerHTML = eventTypes.map(type => {
            const value = typeof type === 'string' ? type : type.en;
            const label = typeof type === 'string' ? type : (currentLang === 'ar' ? type.ar : type.en);
            return `<option value="${value}">${label}</option>`;
          }).join('');
          if (currentValue) fbdEventTypeSelect.value = currentValue;
        }
        
        // Load library categories (basic)
        const libraryCategories = await categoriesLoader.getLibraryCategoriesBasic();
        const libCategorySelect = document.getElementById('libCategory');
        
        if (libCategorySelect) {
          const currentValue = libCategorySelect.value;
          libCategorySelect.innerHTML = libraryCategories.map(cat => {
            // Handle both old format and new format with translations
            const value = cat.value;
            const label = typeof cat.label === 'string' 
              ? cat.label 
              : (currentLang === 'ar' ? cat.label.ar : cat.label.en);
            return `<option value="${value}">${label}</option>`;
          }).join('');
          if (currentValue) libCategorySelect.value = currentValue;
        }
        
        console.log('[Admin Dashboard] ✓ Categories loaded successfully');
      } catch (error) {
        console.error('[Admin Dashboard] ✗ Error loading categories:', error);
      }
    }

    /*************************************************
     * رسائل واجهة
     *************************************************/
    function showMessage(text, type) {
      const el = document.getElementById('message');
      el.textContent = text;
      el.className = `message ${type}`;
      el.style.display = 'block';
      setTimeout(()=>{el.style.display='none'}, 5000);
    }
    window.showMessage = showMessage;

    window.reapplyTranslations = function() {
      if (typeof setLanguage === 'function') {
        const lang = localStorage.getItem('language') || 'en';
        setLanguage(lang);
      }
    };

    window.showTab = function(tab) {
      document.querySelectorAll('.content > .tab-content').forEach(t=>t.classList.remove('active'));
      const target = document.getElementById(`${tab}-tab`);
      if (target) target.classList.add('active');
      if (tab==='events') loadExistingEvents();
      if (tab==='articles') loadExistingArticles();
      if (tab==='library') loadExistingLibraryResources();
      if (tab==='models3d') loadExistingModels3D();
      if (tab==='education') { loadEducationContent(); loadCourses(); }
      if (tab==='fbd') { loadFbd(); }
      if (tab==='settings') { testFirestoreConnection(); loadAdminsList?.(); }
    };

    /*************************************************
     * تحميل القوائم
     *************************************************/
    window.loadExistingEvents = async function() {
      const box = document.getElementById('existingEventsList');
      box.innerHTML = '<p>Loading events...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        CACHE.events = r.content.events || [];
        if (CACHE.events.length===0) { box.innerHTML = '<p>No events found.</p>'; return; }
        box.innerHTML = CACHE.events.map(ev => `
          <div class="content-item">
            <div><strong>${ev.title || '(no title)'}</strong><br><small>${ev.time ? new Date(ev.time).toLocaleString() : '—'} ${ev.location ? ' - ' + ev.location : ''}</small></div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editEvent('${ev.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteEvent('${ev.id}')">Delete</button>
            </div>
          </div>
        `).join('');
        reapplyTranslations();
      } catch (e) { console.error(e); box.innerHTML='<p style="color:red">Error loading events</p>'; }
    };

    window.editEvent = function(id) {
      const ev = CACHE.events.find(x=>x.id===id); if (!ev) return;
      eventForm.dataset.mode = 'edit';
      eventId.value = ev.id;
      eventTitle.value = ev.title || '';
      eventTime.value = ev.time ? new Date(ev.time).toISOString().slice(0,16) : '';
      eventLocation.value = ev.location || '';
      eventType.value = ev.type || 'Workshop';
      eventSeats.value = ev.seats ?? 10;
        const imgStatus = document.getElementById('eventImageStatus');
        if (imgStatus) imgStatus.textContent = ev.hasImageChunks ? 'Main image uploaded' : '';
        const galStatus = document.getElementById('eventGalleryStatus');
        if (galStatus) galStatus.textContent = ev.hasGalleryImages ? 'Gallery images uploaded' : '';
        eventRegisterUrl.value = ev.registerUrl || '';
        eventDescription.value = ev.description || '';
      eventSubmitBtn.textContent = 'Update Event';
    };

    window.deleteEvent = async function(id) {
      if (!confirm('Are you sure you want to delete this event?')) return;
      const r = await firestoreAPI.deleteEvent(id);
      if (r.success) { showMessage('Event deleted successfully!', 'success'); loadExistingEvents(); }
      else showMessage(r.error || 'Failed to delete event', 'error');
    };

    window.loadExistingArticles = async function() {
      const box = document.getElementById('existingArticlesList');
      box.innerHTML = '<p>Loading articles...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        CACHE.articles = r.content.magazine?.articles || [];
        if (CACHE.articles.length===0) { box.innerHTML = '<p>No articles found.</p>'; return; }
        box.innerHTML = CACHE.articles.map(a => `
          <div class="content-item">
            <div><strong>${a.title || '(no title)'}</strong><br><small>${a.author ? 'by ' + a.author : ''} ${a.date || ''}</small></div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editArticle('${a.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteArticle('${a.id}')">Delete</button>
            </div>
          </div>
        `).join('');
        reapplyTranslations();
      } catch (e) { console.error(e); box.innerHTML='<p style="color:red">Error loading articles</p>'; }
    };

    window.editArticle = function(id) {
      const a = CACHE.articles.find(x=>x.id===id); if (!a) return;
      articleForm.dataset.mode = 'edit';
      articleId.value = a.id;
      articleTitle.value = a.title || '';
      articleAuthor.value = a.author || '';
      articleDate.value = a.date || '';
      articleSummary.value = a.summary || '';
      articleContent.value = a.content || '';
      articleImageUrl.value = a.imageUrl || '';
      articleReadMoreUrl.value = a.readMoreUrl || '';
      articleSubmitBtn.textContent = 'Update Article';
    };

    window.deleteArticle = async function(id) {
      if (!confirm('Are you sure you want to delete this article?')) return;
      const r = await firestoreAPI.deleteArticle(id);
      if (r.success) { showMessage('Article deleted successfully!', 'success'); loadExistingArticles(); }
      else showMessage(r.error || 'Failed to delete article', 'error');
    };

    window.loadExistingLibraryResources = async function() {
      const box = document.getElementById('existingLibraryList');
      box.innerHTML = '<p>Loading resources...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        CACHE.library = r.content.library || [];
        if (CACHE.library.length===0) { box.innerHTML = '<p>No resources found.</p>'; return; }
        box.innerHTML = CACHE.library.map(it => `
          <div class="content-item">
            <div><strong>${it.name || '(no name)'}</strong><br><small>${it.type || ''} - ${it.category || 'file'}${Array.isArray(it.tags) && it.tags.length ? ' - ' + it.tags.join(', ') : ''}</small></div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editLibrary('${it.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteLibraryResource('${it.id}')">Delete</button>
            </div>
          </div>
        `).join('');
        reapplyTranslations();
      } catch (e) { console.error(e); box.innerHTML='<p style="color:red">Error loading resources</p>'; }
    };

    window.editLibrary = function(id) {
      const r = CACHE.library.find(x=>x.id===id); if (!r) return;
      libraryForm.dataset.mode = 'edit';
      libId.value = r.id;
      libName.value = r.name || '';
      libType.value = r.type || 'Book';
      libCategory.value = r.category || 'file';
      libTags.value = Array.isArray(r.tags) ? r.tags.join(', ') : (r.tags || '');
      libImage.value = r.image || '';
      libImageUrl.value = r.imageUrl || '';
      libDescription.value = r.description || '';
      libLink.value = r.link || '';
      libSubmitBtn.textContent = 'Update Resource';
    };

    window.deleteLibraryResource = async function(id) {
      if (!confirm('Are you sure you want to delete this resource?')) return;
      const r = await firestoreAPI.deleteLibraryResource(id);
      if (r.success) { showMessage('Resource deleted successfully!', 'success'); loadExistingLibraryResources(); }
      else showMessage(r.error || 'Failed to delete resource', 'error');
    };

    window.loadExistingModels3D = async function() {
      const box = document.getElementById('existingModels3dList');
      box.innerHTML = '<p>Loading 3D models...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        CACHE.models3d = r.content.models3d || [];

        if (CACHE.models3d.length === 0) {
          box.innerHTML = '<p>No 3D models found.</p>';
          return;
        }

        const sortedModels = [...CACHE.models3d].sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
        });

        box.innerHTML = sortedModels.map(model => `
          <div class="content-item">
            <div>
              <strong>${model.name || '(no name)'}</strong><br>
              <small>Code: ${model.code || '—'} - Date: ${model.date || '—'}${Array.isArray(model.tags) && model.tags.length ? ' - Tags: ' + model.tags.join(', ') : ''}</small>
            </div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editModel3D('${model.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteModel3D('${model.id}')">Delete</button>
            </div>
          </div>
        `).join('');
      } catch (e) {
        console.error(e);
        box.innerHTML = '<p style="color:red">Error loading 3D models</p>';
      }
    };

    window.editModel3D = function(id) {
      const model = CACHE.models3d.find(x => x.id === id);
      if (!model) return;

      models3dForm.dataset.mode = 'edit';
      model3dId.value = model.id;
      model3dCode.value = model.code || '';
      model3dName.value = model.name || '';
      model3dDate.value = model.date || '';
      model3dTags.value = Array.isArray(model.tags) ? model.tags.join(', ') : (model.tags || '');
      model3dSubmitBtn.textContent = 'Update 3D Model';
    };

    window.deleteModel3D = async function(id) {
      if (!confirm('Are you sure you want to delete this 3D model?')) return;
      const r = await firestoreAPI.deleteModel3D(id);
      if (r.success) {
        showMessage('3D model deleted successfully!', 'success');
        loadExistingModels3D();
      } else {
        showMessage(r.error || 'Failed to delete 3D model', 'error');
      }
    };

    window.loadEducationContent = async function() {
      try {
        const r = await firestoreAPI.getAllContent();
        const w = r.success ? r.content.education?.weeklyWorkshop : null;
        if (w) { 
          weekTitle.value = w.weekTitle || ''; 
          lecturerName.value = w.lecturerName || ''; 
          weekDescription.value = w.description || ''; 
          workshopUrl.value = w.workshopUrl || '';
        }
      } catch (e) { console.error(e); }
    };

    window.loadCourses = async function() {
      const box = document.getElementById('existingCoursesList');
      box.innerHTML = '<p>Loading courses...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        CACHE.courses = r.content.education?.courses || [];
        if (CACHE.courses.length===0) { box.innerHTML = '<p>No courses found.</p>'; return; }
        box.innerHTML = CACHE.courses.map(c => `
          <div class="content-item">
            <div><strong>${c.title || '(no title)'}</strong><br><small>${c.lecturer ? c.lecturer+' — ' : ''}${c.link ? `<a href="${c.link}" target="_blank" rel="noopener noreferrer">Link</a>` : ''}</small></div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editCourse('${c.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteCourse('${c.id}')">Delete</button>
            </div>
          </div>
        `).join('');
      } catch (e) { console.error(e); box.innerHTML = '<p style="color:red">Error loading courses</p>'; }
    };

    window.editCourse = function(id) {
      const c = CACHE.courses.find(x=>x.id===id); if (!c) return;
      courseForm.dataset.mode = 'edit';
      courseId.value = c.id;
      courseTitle.value = c.title || '';
      courseDescription.value = c.description || '';
      courseLecturer.value = c.lecturer || '';
      courseLink.value = c.link || '';
      courseImageUrl.value = c.imageUrl || '';
      courseEnrollUrl.value = c.enrollUrl || '';
      courseSubmitBtn.textContent = 'Update Course';
    };

    window.deleteCourse = async function(id) {
      if (!confirm('Are you sure you want to delete this course?')) return;
      const r = await firestoreAPI.deleteCourse(id);
      if (r.success) { showMessage('Course deleted', 'success'); loadCourses(); }
      else showMessage(r.error || 'Failed to delete course', 'error');
    };

    window.loadFbd = async function() {
      const box = document.getElementById('existingFbdEventsList');
      box.innerHTML = '<p>Loading FBD events...</p>';
      try {
        const r = await firestoreAPI.getAllContent();
        if (!r.success) throw new Error(r.error);
        const fbd = r.content.education?.fbd || { pageTitle:'', about:'', events:[] };
        fbdTitle.value = fbd.pageTitle || '';
        fbdAbout.value = fbd.about || '';
        CACHE.fbdEvents = fbd.events || [];
        if (CACHE.fbdEvents.length===0) { box.innerHTML = '<p>No FBD events found.</p>'; return; }
        box.innerHTML = CACHE.fbdEvents.map(ev => `
          <div class="content-item">
            <div><strong>${ev.title || '(no title)'}</strong><br><small>${ev.time ? new Date(ev.time).toLocaleString() : '—'} ${ev.location ? ' - ' + ev.location : ''}</small></div>
            <div class="user-actions">
              <button class="btn edit-btn" onclick="editFbdEvent('${ev.id}')">Edit</button>
              <button class="btn delete-btn" onclick="deleteFbdEvent('${ev.id}')">Delete</button>
            </div>
          </div>
        `).join('');
      } catch (e) { console.error(e); box.innerHTML = '<p style="color:red">Error loading FBD</p>'; }
    };

    window.editFbdEvent = function(id) {
      const ev = CACHE.fbdEvents.find(x=>x.id===id); if (!ev) return;
      fbdEventForm.dataset.mode = 'edit';
      fbdEventId.value = ev.id;
      fbdEventTitle.value = ev.title || '';
      fbdEventTime.value = ev.time ? new Date(ev.time).toISOString().slice(0,16) : '';
      fbdEventLocation.value = ev.location || '';
      fbdEventType.value = ev.type || 'Workshop';
      fbdEventSeats.value = ev.seats ?? 10;
        const fImgStatus = document.getElementById('fbdEventImageStatus');
        if (fImgStatus) fImgStatus.textContent = ev.hasImageChunks ? 'Main image uploaded' : '';
        const fGalStatus = document.getElementById('fbdEventGalleryStatus');
        if (fGalStatus) fGalStatus.textContent = ev.hasGalleryImages ? 'Gallery images uploaded' : '';
        fbdEventRegisterUrl.value = ev.registerUrl || '';
        fbdEventDescription.value = ev.description || '';
      fbdEventSubmitBtn.textContent = 'Update FBD Event';
    };

    window.deleteFbdEvent = async function(id) {
      if (!confirm('Are you sure you want to delete this FBD event?')) return;
      const r = await firestoreAPI.deleteFbdEvent(id);
      if (r.success) { showMessage('FBD event deleted', 'success'); loadFbd(); }
      else showMessage(r.error || 'Failed to delete FBD event', 'error');
    };

    /*************************************************
     * عناصر النماذج
     *************************************************/
    const eventForm         = document.getElementById('eventForm');
    const eventId           = document.getElementById('eventId');
    const eventTitle        = document.getElementById('eventTitle');
    const eventTime         = document.getElementById('eventTime');
    const eventLocation     = document.getElementById('eventLocation');
    const eventType         = document.getElementById('eventType');
    const eventSeats        = document.getElementById('eventSeats');
    const eventImage        = document.getElementById('eventImage');
    const eventImageUrl     = document.getElementById('eventImageUrl');
    const eventRegisterUrl  = document.getElementById('eventRegisterUrl');
    const eventDetailsUrl   = document.getElementById('eventDetailsUrl');
    const eventGalleryUrl   = document.getElementById('eventGalleryUrl');
    const eventDescription  = document.getElementById('eventDescription');
    const eventSubmitBtn    = document.getElementById('eventSubmitBtn');
    const eventErrorsBox    = document.getElementById('eventErrors');

    const articleForm       = document.getElementById('articleForm');
    const articleId         = document.getElementById('articleId');
    const articleTitle      = document.getElementById('articleTitle');
    const articleAuthor     = document.getElementById('articleAuthor');
    const articleDate       = document.getElementById('articleDate');
    const articleSummary    = document.getElementById('articleSummary');
    const articleContent    = document.getElementById('articleContent');
    const articleImageUrl   = document.getElementById('articleImageUrl');
    const articleReadMoreUrl = document.getElementById('articleReadMoreUrl');
    const articleSubmitBtn  = document.getElementById('articleSubmitBtn');
    const articleErrorsBox  = document.getElementById('articleErrors');

    const libraryForm       = document.getElementById('libraryForm');
    const libId             = document.getElementById('libId');
    const libName           = document.getElementById('libName');
    const libType           = document.getElementById('libType');
    const libCategory       = document.getElementById('libCategory');
    const libTags           = document.getElementById('libTags');
    const libImage          = document.getElementById('libImage');
    const libImageUrl       = document.getElementById('libImageUrl');
    const libDescription    = document.getElementById('libDescription');
    const libLink           = document.getElementById('libLink');
    const libSubmitBtn      = document.getElementById('libSubmitBtn');
    const libraryErrorsBox  = document.getElementById('libraryErrors');

    const models3dForm      = document.getElementById('models3dForm');
    const model3dId         = document.getElementById('model3dId');
    const model3dCode       = document.getElementById('model3dCode');
    const model3dName       = document.getElementById('model3dName');
    const model3dDate       = document.getElementById('model3dDate');
    const model3dTags       = document.getElementById('model3dTags');
    const model3dSubmitBtn  = document.getElementById('model3dSubmitBtn');
    const models3dErrorsBox = document.getElementById('models3dErrors');

    const educationForm     = document.getElementById('educationForm');
    const weekTitle         = document.getElementById('weekTitle');
    const lecturerName      = document.getElementById('lecturerName');
    const weekDescription   = document.getElementById('weekDescription');
    const workshopUrl       = document.getElementById('workshopUrl');
    const educationErrorsBox= document.getElementById('educationErrors');

    const courseForm        = document.getElementById('courseForm');
    const courseId          = document.getElementById('courseId');
    const courseTitle       = document.getElementById('courseTitle');
    const courseDescription = document.getElementById('courseDescription');
    const courseLecturer    = document.getElementById('courseLecturer');
    const courseLink        = document.getElementById('courseLink');
    const courseImageUrl    = document.getElementById('courseImageUrl');
    const courseEnrollUrl   = document.getElementById('courseEnrollUrl');
    const courseSubmitBtn   = document.getElementById('courseSubmitBtn');
    const courseErrorsBox   = document.getElementById('courseErrors');

    const fbdPageForm       = document.getElementById('fbdPageForm');
    const fbdTitle          = document.getElementById('fbdTitle');
    const fbdAbout          = document.getElementById('fbdAbout');

    const fbdEventForm          = document.getElementById('fbdEventForm');
    const fbdEventId            = document.getElementById('fbdEventId');
    const fbdEventTitle         = document.getElementById('fbdEventTitle');
    const fbdEventTime          = document.getElementById('fbdEventTime');
    const fbdEventLocation      = document.getElementById('fbdEventLocation');
    const fbdEventType          = document.getElementById('fbdEventType');
    const fbdEventSeats         = document.getElementById('fbdEventSeats');
    const fbdEventImage         = document.getElementById('fbdEventImage');
    const fbdEventImageUrl      = document.getElementById('fbdEventImageUrl');
    const fbdEventRegisterUrl   = document.getElementById('fbdEventRegisterUrl');
    const fbdEventDetailsUrl    = document.getElementById('fbdEventDetailsUrl');
    const fbdEventGalleryUrl    = document.getElementById('fbdEventGalleryUrl');
    const fbdEventDescription   = document.getElementById('fbdEventDescription');
    const fbdEventSubmitBtn     = document.getElementById('fbdEventSubmitBtn');
    const fbdEventErrorsBox     = document.getElementById('fbdEventErrors');

    /*************************************************
     * أدوات مساعدة للتحقق
     *************************************************/
    function showErrors(box, errors) {
      if (!box) return;
      if (!errors.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      box.style.display = 'block';
      box.innerHTML = `<ul>${errors.map(e=>`<li>${e}</li>`).join('')}</ul>`;
    }

    function toISO(dtValue) {
      if (!dtValue) return '';
      const date = new Date(dtValue);
      return isNaN(date.getTime()) ? '' : date.toISOString();
    }

    function validateEventPayload(p) {
      const errors = [];
      // p already contains trimmed values from submit handler
      if (!p.title || p.title.length < 3) errors.push('العنوان مطلوب (3 أحرف على الأقل).');
      if (!p.time) errors.push('التاريخ والوقت مطلوبان.');
      if (!p.location || p.location.length < 2) errors.push('الموقع مطلوب.');
      if (!p.description || p.description.length < 10) errors.push('الوصف مطلوب (10 أحرف على الأقل).');
      if (!Number.isFinite(p.seats) || p.seats <= 0) errors.push('عدد المقاعد يجب أن يكون رقمًا أكبر من صفر.');
      
      return errors;
    }

    function validateFbdEventPayload(p) {
      // نفس منطق الفعاليات العادية
      return validateEventPayload(p);
    }

    function validateArticlePayload(p) {
      const errors = [];
      // p already contains trimmed values from submit handler
      if (!p.title || p.title.length === 0) errors.push('عنوان المقال مطلوب.');
      if (!p.author || p.author.length === 0) errors.push('اسم الكاتب مطلوب.');
      if (!p.date || p.date.length === 0) errors.push('التاريخ مطلوب.');
      if (!p.summary || p.summary.length < 5) errors.push('الملخص قصير جداً.');
      if (!p.content || p.content.length < 20) errors.push('المحتوى يجب أن يكون 20 حرفاً فأكثر.');
      return errors;
    }

    function validateLibraryPayload(p) {
      const errors = [];
      // p already contains trimmed values from submit handler
      if (!p.name || p.name.length === 0) errors.push('اسم المصدر مطلوب.');
      if (!p.type || p.type.length === 0) errors.push('نوع المصدر مطلوب.');
      if (!p.description || p.description.length < 5) errors.push('الوصف قصير جداً.');
      if (!p.image || p.image.length === 0) errors.push('الإيموجي مطلوب.');
      if (!p.link || p.link.length === 0) errors.push('الرابط مطلوب.');
      return errors;
    }

    function validateCoursePayload(p) {
      const errors = [];
      // p already contains trimmed values from submit handler
      if (!p.title || p.title.length === 0) errors.push('عنوان الدورة مطلوب.');
      if (!p.description || p.description.length < 5) errors.push('وصف الدورة قصير جداً.');
      return errors;
    }

    function validateModel3DPayload(p) {
      const errors = [];
      if (!p.code || p.code.length !== 10) errors.push('رمز النموذج يجب أن يكون 10 أحرف بالضبط.');
      if (!p.name || p.name.length < 2) errors.push('اسم النموذج مطلوب.');
      if (!p.date) errors.push('تاريخ النموذج مطلوب.');
      return errors;
    }

    function validateWorkshopPayload(p) {
      const errors = [];
      // p already contains trimmed values from submit handler
      if (!p.weekTitle || p.weekTitle.length === 0) errors.push('عنوان الورشة مطلوب.');
      if (!p.lecturerName || p.lecturerName.length === 0) errors.push('اسم المحاضر مطلوب.');
      if (!p.description || p.description.length < 10) errors.push('الوصف قصير جداً.');
      return errors;
    }

    /*************************************************
     * إرسال نموذج الفعالية (Events)
     *************************************************/
    eventForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const mode = eventForm.dataset.mode || 'add';
      
      // Debug: Direct read before building payload
      console.log('[DEBUG DIRECT READ]', {
        title: eventTitle.value,
        timeRaw: eventTime.value,
        location: eventLocation.value,
        type: eventType.value,
        seats: eventSeats.value,
        imageUrl: eventImageUrl.value,
        registerUrl: eventRegisterUrl.value,
        description: eventDescription.value
      });
      
      const payload = {
        title: eventTitle.value.trim(),
        time: toISO(eventTime.value),
        location: eventLocation.value.trim(),
        type: eventType.value,
        seats: Number(eventSeats.value),
        imageUrl: eventImageUrl.value.trim(),
        registerUrl: eventRegisterUrl.value.trim(),
        description: eventDescription.value.trim()
      };
      console.log('[EventForm] Raw values:', payload);
      const errors = validateEventPayload(payload);
      showErrors(eventErrorsBox, errors);
      if (errors.length) { console.warn('[EventForm] Validation failed:', errors); return; }

      eventSubmitBtn.disabled = true;
      const originalText = eventSubmitBtn.textContent;
      eventSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
          // If we pre-uploaded images for a new event, we MUST update the payload!
          if (eventForm.dataset.mainUploaded === 'true') {
              payload.hasImageChunks = true;
          }
          if (eventForm.dataset.galleryUploaded === 'true') {
              payload.hasGalleryImages = true;
          }

          const r = mode==='edit'
            ? await firestoreAPI.updateEvent(eventId.value, payload)
            : await firestoreAPI.addEvent(payload, eventId.value);
            
          if (r.success) {
            showMessage('Event saved successfully!', 'success');
            eventForm.reset();
            eventForm.dataset.mainUploaded = 'false';
            eventForm.dataset.galleryUploaded = 'false';
            eventForm.dataset.mode = 'add';
            eventId.value = '';
            eventSubmitBtn.textContent = 'Add Event';
            document.getElementById('eventImageStatus').textContent = '';
            document.getElementById('eventGalleryStatus').textContent = '';
            loadExistingEvents();
          } else {
            showMessage(r.error || 'Failed to save event', 'error');
          }
        } catch (err) {
          console.error('[EventForm] Exception:', err);
          showMessage('Unexpected error saving event', 'error');
        } finally {
          eventSubmitBtn.disabled = false;
          if (mode !== 'edit') eventSubmitBtn.textContent = originalText;
        }
    }, true);

    /*************************************************
     * إرسال نموذج المقال (Articles)
     *************************************************/
    articleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const mode = articleForm.dataset.mode || 'add';
      const payload = {
        title: articleTitle.value.trim(),
        author: articleAuthor.value.trim(),
        date: articleDate.value,
        summary: articleSummary.value.trim(),
        content: articleContent.value.trim(),
        imageUrl: articleImageUrl.value.trim(),
        readMoreUrl: articleReadMoreUrl.value.trim()
      };
      const errors = validateArticlePayload(payload);
      showErrors(articleErrorsBox, errors);
      if (errors.length) { console.warn('[ArticleForm] Validation failed:', errors); return; }

      articleSubmitBtn.disabled = true;
      const originalText = articleSubmitBtn.textContent;
      articleSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
        const r = mode==='edit'
          ? await firestoreAPI.updateArticle(articleId.value, payload)
          : await firestoreAPI.addArticle(payload);
        if (r.success) {
          showMessage('Article saved successfully!', 'success');
          articleForm.reset();
          articleForm.dataset.mode = 'add';
          articleSubmitBtn.textContent = 'Add Article';
          loadExistingArticles();
        } else {
          showMessage(r.error || 'Failed to save article', 'error');
        }
      } catch (err) {
        console.error('[ArticleForm] Exception:', err);
        showMessage('Unexpected error saving article', 'error');
      } finally {
        articleSubmitBtn.disabled = false;
        if (mode !== 'edit') articleSubmitBtn.textContent = originalText;
      }
    }, true);

    /*************************************************
     * إرسال نموذج المكتبة (Library)
     *************************************************/
    libraryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const mode = libraryForm.dataset.mode || 'add';
      const payload = {
        name: libName.value.trim(),
        type: libType.value,
        category: libCategory.value,
        tags: libTags.value ? libTags.value.split(',').map(t=>t.trim()).filter(Boolean) : [],
        image: libImage.value.trim(),
        imageUrl: libImageUrl.value.trim(),
        description: libDescription.value.trim(),
        link: libLink.value.trim()
      };
      const errors = validateLibraryPayload(payload);
      showErrors(libraryErrorsBox, errors);
      if (errors.length) { console.warn('[LibraryForm] Validation failed:', errors); return; }

      libSubmitBtn.disabled = true;
      const originalText = libSubmitBtn.textContent;
      libSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
        const r = mode==='edit'
          ? await firestoreAPI.updateLibraryResource(libId.value, payload)
          : await firestoreAPI.addLibraryResource(payload);
        if (r.success) {
          showMessage('Resource saved successfully!', 'success');
          libraryForm.reset();
          libraryForm.dataset.mode = 'add';
          libSubmitBtn.textContent = 'Add Resource';
          loadExistingLibraryResources();
        } else {
          showMessage(r.error || 'Failed to save resource', 'error');
        }
      } catch (err) {
        console.error('[LibraryForm] Exception:', err);
        showMessage('Unexpected error saving resource', 'error');
      } finally {
        libSubmitBtn.disabled = false;
        if (mode !== 'edit') libSubmitBtn.textContent = originalText;
      }
    }, true);

    /*************************************************
     * إرسال نموذج النماذج ثلاثية الأبعاد (3D Models)
     *************************************************/
    models3dForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const mode = models3dForm.dataset.mode || 'add';
      const payload = {
        code: model3dCode.value.trim(),
        name: model3dName.value.trim(),
        date: model3dDate.value,
        tags: model3dTags.value ? model3dTags.value.split(',').map(t => t.trim()).filter(Boolean) : []
      };

      const errors = validateModel3DPayload(payload);
      showErrors(models3dErrorsBox, errors);
      if (errors.length) {
        console.warn('[Models3DForm] Validation failed:', errors);
        return;
      }

      model3dSubmitBtn.disabled = true;
      const originalText = model3dSubmitBtn.textContent;
      model3dSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
        const r = mode === 'edit'
          ? await firestoreAPI.updateModel3D(model3dId.value, payload)
          : await firestoreAPI.addModel3D(payload);

        if (r.success) {
          showMessage('3D model saved successfully!', 'success');
          models3dForm.reset();
          models3dForm.dataset.mode = 'add';
          model3dSubmitBtn.textContent = 'Add 3D Model';
          loadExistingModels3D();
        } else {
          showMessage(r.error || 'Failed to save 3D model', 'error');
        }
      } catch (err) {
        console.error('[Models3DForm] Exception:', err);
        showMessage('Unexpected error saving 3D model', 'error');
      } finally {
        model3dSubmitBtn.disabled = false;
        if (mode !== 'edit') model3dSubmitBtn.textContent = originalText;
      }
    }, true);

    /*************************************************
     * إرسال نموذج الورشة الأسبوعية (Education)
     *************************************************/
    educationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const payload = {
        weekTitle: weekTitle.value.trim(),
        lecturerName: lecturerName.value.trim(),
        description: weekDescription.value.trim(),
        workshopUrl: workshopUrl.value.trim()
      };
      const errors = validateWorkshopPayload(payload);
      showErrors(educationErrorsBox, errors);
      if (errors.length) { console.warn('[EducationForm] Validation failed:', errors); return; }

      try {
        const r = await firestoreAPI.updateEducation(payload);
        if (r.success) showMessage('Education content updated!', 'success');
        else showMessage(r.error || 'Failed to update education content', 'error');
      } catch (err) {
        console.error('[EducationForm] Exception:', err);
        showMessage('Unexpected error updating education content', 'error');
      }
    }, true);

    /*************************************************
     * إرسال نموذج الدورات (Courses)
     *************************************************/
    courseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const mode = courseForm.dataset.mode || 'add';
      const payload = {
        title: courseTitle.value.trim(),
        description: courseDescription.value.trim(),
        lecturer: courseLecturer.value.trim(),
        link: courseLink.value.trim(),
        imageUrl: courseImageUrl.value.trim(),
        enrollUrl: courseEnrollUrl.value.trim()
      };
      const errors = validateCoursePayload(payload);
      showErrors(courseErrorsBox, errors);
      if (errors.length) { console.warn('[CourseForm] Validation failed:', errors); return; }

      courseSubmitBtn.disabled = true;
      const originalText = courseSubmitBtn.textContent;
      courseSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
        const r = mode==='edit'
          ? await firestoreAPI.updateCourse(courseId.value, payload)
          : await firestoreAPI.addCourse(payload);
        if (r.success) {
          showMessage('Course saved', 'success');
          courseForm.reset();
          courseForm.dataset.mode = 'add';
          courseSubmitBtn.textContent = 'Add Course';
          loadCourses();
        } else {
          showMessage(r.error || 'Failed to save course', 'error');
        }
      } catch (err) {
        console.error('[CourseForm] Exception:', err);
        showMessage('Unexpected error saving course', 'error');
      } finally {
        courseSubmitBtn.disabled = false;
        if (mode !== 'edit') courseSubmitBtn.textContent = originalText;
      }
    }, true);

    /*************************************************
     * إرسال نموذج صفحة FBD
     *************************************************/
    fbdPageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await firestoreAPI.updateFbdPage({
          pageTitle: fbdTitle.value,
          about: fbdAbout.value
        });
        if (r.success) showMessage('FBD page updated', 'success');
        else showMessage(r.error || 'Failed to update FBD page', 'error');
      } catch (err) {
        console.error('[FbdPageForm] Exception:', err);
        showMessage('Unexpected error updating FBD page', 'error');
      }
    });

    /*************************************************
     * إرسال نموذج فعالية FBD (FBD Events)
     *************************************************/
    fbdEventForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const mode = fbdEventForm.dataset.mode || 'add';
      
      // Debug: Direct read before building payload
      console.log('[DEBUG DIRECT READ - FBD]', {
        title: fbdEventTitle.value,
        timeRaw: fbdEventTime.value,
        location: fbdEventLocation.value,
        type: fbdEventType.value,
        seats: fbdEventSeats.value,
        imageUrl: fbdEventImageUrl.value,
        registerUrl: fbdEventRegisterUrl.value,
        description: fbdEventDescription.value
      });
      
      const payload = {
        title: fbdEventTitle.value.trim(),
        time: toISO(fbdEventTime.value),
        location: fbdEventLocation.value.trim(),
        type: fbdEventType.value,
        seats: Number(fbdEventSeats.value),
        imageUrl: fbdEventImageUrl.value.trim(),
        registerUrl: fbdEventRegisterUrl.value.trim(),
        description: fbdEventDescription.value.trim()
      };
      const errors = validateFbdEventPayload(payload);
      showErrors(fbdEventErrorsBox, errors);
      if (errors.length) { console.warn('[FbdEventForm] Validation failed:', errors); return; }

      fbdEventSubmitBtn.disabled = true;
      const originalText = fbdEventSubmitBtn.textContent;
      fbdEventSubmitBtn.textContent = mode === 'edit' ? 'Updating...' : 'Saving...';

      try {
          const r = mode==='edit'
            ? await firestoreAPI.updateFbdEvent(fbdEventId.value, payload)
            : await firestoreAPI.addFbdEvent(payload, fbdEventId.value);
          if (r.success) {
            const docId = mode === 'edit' ? fbdEventId.value : r.id;
            
            // If we pre-uploaded images for a new event, we MUST update the payload!
            if (fbdEventForm.dataset.mainUploaded === 'true') {
                payload.hasImageChunks = true;
            }
            if (fbdEventForm.dataset.galleryUploaded === 'true') {
                payload.hasGalleryImages = true;
            }

            showMessage('FBD Event saved successfully!', 'success');
            fbdEventForm.reset();
            fbdEventForm.dataset.mainUploaded = 'false';
            fbdEventForm.dataset.galleryUploaded = 'false';
            fbdEventForm.dataset.mode = 'add';
            fbdEventId.value = '';
            fbdEventSubmitBtn.textContent = 'Add FBD Event';
            document.getElementById('fbdEventImageStatus').textContent = '';
            document.getElementById('fbdEventGalleryStatus').textContent = '';
            loadFbd();
          } else {
            showMessage(r.error || 'Failed to save FBD event', 'error');
          }
        } catch (err) {
          console.error('[FbdEventForm] Exception:', err);
          showMessage('Unexpected error saving FBD event', 'error');
        } finally {
          fbdEventSubmitBtn.disabled = false;
          if (mode !== 'edit') fbdEventSubmitBtn.textContent = originalText;
        }
    }, true);

    /*************************************************
     * إعدادات / أدوات الصيانة
     *************************************************/
    window.testFirestoreConnection = async function() {
      const el = document.getElementById('tokenStatusText');
      el.textContent = 'Testing...';
      const r = await firestoreAPI.testConnection();
      el.textContent = r.success ? 'Connected' : `Error: ${r.error}`;
      document.getElementById('tokenStatus').style.background = r.success ? '#f0fff4' : '#fff5f5';
    };

    window.fixFirestoreStructure = async function() {
      const box = document.getElementById('structureResults');
      const content = document.getElementById('structureResultsContent');
      box.style.display = 'block';
      content.innerHTML = '<p>Validating and fixing structure...</p>';
      const r = await firestoreAPI.validateAndFixStructure();
      const actions = (r.actions||[]).map(a=>`<li style="color:#2f855a">✓ ${a}</li>`).join('');
      const errors  = (r.errors ||[]).map(e=>`<li style="color:#c53030">✗ ${e}</li>`).join('');
      content.innerHTML = `<ul>${actions}${errors}</ul>`;
    };

    window.loadAdminsList = async function() {
      const box = document.getElementById('adminsList'); box.innerHTML = '<p>Loading...</p>';
      const r = await firestoreAPI.getAdmins();
      if (!r.success) { box.innerHTML = `<p style="color:red">${r.error}</p>`; return; }
      if ((r.admins||[]).length===0) { box.innerHTML = '<p>No admins found.</p>'; return; }
      box.innerHTML = r.admins.map(a=>`<div class="content-item"><div>${a}</div></div>`).join('');
    };

    /*************************************************
     * END
     *************************************************/
  