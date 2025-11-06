// Firestore API Integration for Content Management (all under content/)
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ",
  authDomain: "aias-bsr.firebaseapp.com",
  projectId: "aias-bsr",
  storageBucket: "aias-bsr.firebasestorage.app",
  messagingSenderId: "78055223814",
  appId: "1:78055223814:web:99460402c2b1fcd5ae8987",
  measurementId: "G-6W50T4HXDV"
};

// Initialize Firebase (with error handling for multiple initializations)
let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
const db = getFirestore(app);

class FirestoreAPI {
  constructor() {
    this.db = db;
    this.paths = {
      // Standardized locations under content/
      eventsDoc: ['content', 'events'],
      eventsCol: ['content', 'events', 'items'],
      libraryDoc: ['content', 'library'],
      libraryCol: ['content', 'library', 'items'],
      magazineDoc: ['content', 'magazine'],
      magazineArticlesCol: ['content', 'magazine', 'articles'],
      educationDoc: ['content', 'education'],
      educationCoursesCol: ['content', 'education', 'courses'],
      fbdDoc: ['content', 'fbd'],
      fbdEventsCol: ['content', 'fbd', 'events'],

      // Legacy (for migration/back-compat)
      legacyEventsCol: ['events'],
      legacyLibraryCol: ['library'],
    };
  }

  _docRef(pathArr) { return doc(this.db, ...pathArr); }
  _colRef(pathArr) { return collection(this.db, ...pathArr); }

  // Validate required inputs (surface which fields are missing)
  validateRequiredFields(obj, requiredFields) {
    const emptyFields = [];
    for (const f of requiredFields) {
      const v = obj[f];
      const isMissing =
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0);
      if (isMissing) emptyFields.push(f);
    }
    if (emptyFields.length > 0) {
      return { valid: false, message: `Missing or empty required fields: ${emptyFields.join(', ')}` };
    }
    return { valid: true, message: '' };
  }

  // Make sure base docs exist (prevents “missing” structure errors)
  async ensureBaseDocs() {
    const ensure = async (pathArr, data) => {
      const r = this._docRef(pathArr);
      const s = await getDoc(r);
      if (!s.exists()) await setDoc(r, data || {});
    };
    await ensure(this.paths.eventsDoc, { createdAt: Date.now() });
    await ensure(this.paths.libraryDoc, { createdAt: Date.now() });
    await ensure(this.paths.magazineDoc, { featuredArticleId: null, releases: [] });
    await ensure(this.paths.educationDoc, { weeklyWorkshop: {}, courses: [] }); // legacy array kept for back-compat
    await ensure(this.paths.fbdDoc, { pageTitle: "", about: "" });
  }

  async getAllContent() {
    try {
      await this.ensureBaseDocs();
      const [
        eventsSnap,
        librarySnap,
        magazineDocSnap,
        magazineArticlesSnap,
        educationDocSnap,
        coursesSnap,
        fbdDocSnap,
        fbdEventsSnap,
        legacyEventsSnap,
        legacyLibrarySnap
      ] = await Promise.all([
        getDocs(this._colRef(this.paths.eventsCol)),
        getDocs(this._colRef(this.paths.libraryCol)),
        getDoc(this._docRef(this.paths.magazineDoc)),
        getDocs(this._colRef(this.paths.magazineArticlesCol)),
        getDoc(this._docRef(this.paths.educationDoc)),
        getDocs(this._colRef(this.paths.educationCoursesCol)),
        getDoc(this._docRef(this.paths.fbdDoc)),
        getDocs(this._colRef(this.paths.fbdEventsCol)),
        getDocs(this._colRef(this.paths.legacyEventsCol)),
        getDocs(this._colRef(this.paths.legacyLibraryCol))
      ]);

      // Events (fallback to legacy if new collection empty)
      let events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (events.length === 0 && legacyEventsSnap.size > 0) {
        events = legacyEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Library (fallback to legacy if new collection empty)
      let library = librarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (library.length === 0 && legacyLibrarySnap.size > 0) {
        library = legacyLibrarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Magazine
      let magazine = { featuredArticleId: null, articles: [], releases: [] };
      if (magazineDocSnap.exists()) {
        const md = magazineDocSnap.data();
        magazine.featuredArticleId = md.featuredArticleId ?? null;
        magazine.releases = md.releases ?? [];
      }
      magazine.articles = magazineArticlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Education + Courses + FBD
      let education = { weeklyWorkshop: {}, courses: [], fbd: { pageTitle: "", about: "", events: [] } };
      if (educationDocSnap.exists()) {
        const ed = educationDocSnap.data();
        education.weeklyWorkshop = ed.weeklyWorkshop ?? {};
        if (Array.isArray(ed.courses) && ed.courses.length > 0) {
          // legacy array support
          education.courses = ed.courses.map((c, i) => ({ id: c.id || String(i), ...c }));
        }
      }
      const courseDocs = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (courseDocs.length > 0) education.courses = courseDocs;

      if (fbdDocSnap.exists()) {
        const f = fbdDocSnap.data();
        education.fbd.pageTitle = f.pageTitle ?? "";
        education.fbd.about = f.about ?? "";
      }
      education.fbd.events = fbdEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return { success: true, content: { events, magazine, library, education } };
    } catch (error) {
      console.error('[Firestore API] getAllContent error:', error);
      return { success: false, error: error.message };
    }
  }

  // EVENTS (stored at content/events/items)
  async addEvent(event) {
    const required = ['title', 'time', 'location', 'description'];
    const v = this.validateRequiredFields(event, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.eventsCol), event);
      return { success: true, id: ref.id, message: 'Event added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateEvent(id, event) {
    try {
      await updateDoc(this._docRef([...this.paths.eventsCol, id]), event);
      return { success: true, message: 'Event updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async deleteEvent(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.eventsCol, id]));
      return { success: true, message: 'Event deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // LIBRARY (stored at content/library/items)
  async addLibraryResource(resource) {
    const required = ['name', 'type', 'description'];
    const v = this.validateRequiredFields(resource, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.libraryCol), resource);
      return { success: true, id: ref.id, message: 'Library resource added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateLibraryResource(id, resource) {
    try {
      await updateDoc(this._docRef([...this.paths.libraryCol, id]), resource);
      return { success: true, message: 'Library resource updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async deleteLibraryResource(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.libraryCol, id]));
      return { success: true, message: 'Library resource deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // MAGAZINE (doc + subcollection)
  async addArticle(article) {
    const required = ['title', 'author', 'date', 'summary', 'content'];
    const v = this.validateRequiredFields(article, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.magazineArticlesCol), article);
      return { success: true, id: ref.id, message: 'Article added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateArticle(id, article) {
    try {
      await updateDoc(this._docRef([...this.paths.magazineArticlesCol, id]), article);
      return { success: true, message: 'Article updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async deleteArticle(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.magazineArticlesCol, id]));
      return { success: true, message: 'Article deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // EDUCATION (weekly workshop doc + courses subcollection)
  async updateEducation(weeklyWorkshop) {
    const required = ['weekTitle', 'lecturerName', 'description'];
    const v = this.validateRequiredFields(weeklyWorkshop, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = this._docRef(this.paths.educationDoc);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : { weeklyWorkshop: {}, courses: [] };
      await setDoc(ref, { ...existing, weeklyWorkshop });
      return { success: true, message: 'Education content updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Courses CRUD
  async addCourse(course) {
    const v = this.validateRequiredFields(course, ['title', 'description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.educationCoursesCol), course);
      return { success: true, id: ref.id, message: 'Course added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateCourse(id, course) {
    try {
      await updateDoc(this._docRef([...this.paths.educationCoursesCol, id]), course);
      return { success: true, message: 'Course updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async deleteCourse(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.educationCoursesCol, id]));
      return { success: true, message: 'Course deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // FBD (doc + events subcollection)
  async updateFbdPage({ pageTitle, about }) {
    try {
      await this.ensureBaseDocs();
      await setDoc(this._docRef(this.paths.fbdDoc), { pageTitle: pageTitle ?? "", about: about ?? "" }, { merge: true });
      return { success: true, message: 'FBD page updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async addFbdEvent(event) {
    const v = this.validateRequiredFields(event, ['title', 'time', 'location', 'description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.fbdEventsCol), event);
      return { success: true, id: ref.id, message: 'FBD event added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateFbdEvent(id, event) {
    try {
      await updateDoc(this._docRef([...this.paths.fbdEventsCol, id]), event);
      return { success: true, message: 'FBD event updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async deleteFbdEvent(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.fbdEventsCol, id]));
      return { success: true, message: 'FBD event deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Token compatibility with dashboard
  hasToken() { return true; }
  async getFileContent() { return this.getAllContent(); }
  async updateDataJson(newData) { return this.updateAllContent(newData); }
  setToken(_) {}
  getToken() { return ''; }

  async updateAllContent(content) {
    // Only keeps magazine (doc data) and education (doc data) in sync; list items use subcollections
    try {
      await this.ensureBaseDocs();
      if (content.magazine) {
        await setDoc(this._docRef(this.paths.magazineDoc), {
          featuredArticleId: content.magazine.featuredArticleId ?? null,
          releases: content.magazine.releases ?? []
        }, { merge: true });
      }
      if (content.education) {
        await setDoc(this._docRef(this.paths.educationDoc), content.education, { merge: true });
      }
      return { success: true, message: 'All content updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try { await getDoc(doc(this.db, 'config', 'admins')); return { success: true, message: 'Connection successful' }; }
    catch (error) { return { success: false, error: error.message }; }
  }

  getExpectedStructure() {
    return {
      contentDocs: {
        events: {},
        library: {},
        magazine: { featuredArticleId: null, releases: [] },
        education: { weeklyWorkshop: {}, courses: [] },
        fbd: { pageTitle: "", about: "" }
      },
      subcollections: [
        { parent: ['content', 'events'], name: 'items' },
        { parent: ['content', 'library'], name: 'items' },
        { parent: ['content', 'magazine'], name: 'articles' },
        { parent: ['content', 'education'], name: 'courses' },
        { parent: ['content', 'fbd'], name: 'events' }
      ],
      legacyCollections: ['events', 'library']
    };
  }

  async validateAndFixStructure() {
    const results = { success: true, actions: [], errors: [] };
    try {
      const expected = this.getExpectedStructure();

      // Ensure docs
      for (const [name, defaults] of Object.entries(expected.contentDocs)) {
        try {
          const r = this._docRef(['content', name]);
          const s = await getDoc(r);
          if (!s.exists()) { await setDoc(r, defaults); results.actions.push(`Created content/${name}`); }
          else { results.actions.push(`Validated content/${name}`); }
        } catch (e) { results.errors.push(`Doc content/${name}: ${e.message}`); }
      }

      // Validate subcollections (light read)
      for (const sc of expected.subcollections) {
        try {
          const snap = await getDocs(collection(this.db, ...sc.parent, sc.name));
          results.actions.push(`Validated ${sc.parent.join('/')}/${sc.name} (${snap.size} docs)`);
        } catch (e) { results.errors.push(`Subcollection ${sc.parent.join('/')}/${sc.name}: ${e.message}`); }
      }

      // Migrate legacy events / library if needed
      try {
        const newEvents = await getDocs(this._colRef(this.paths.eventsCol));
        const legacy = await getDocs(this._colRef(this.paths.legacyEventsCol));
        if (newEvents.size === 0 && legacy.size > 0) {
          for (const d of legacy.docs) await addDoc(this._colRef(this.paths.eventsCol), { ...d.data() });
          results.actions.push(`Migrated ${legacy.size} legacy events -> content/events/items`);
        } else results.actions.push('Events migration not needed');
      } catch (e) { results.errors.push(`Migrate events: ${e.message}`); }

      try {
        const newLib = await getDocs(this._colRef(this.paths.libraryCol));
        const legacy = await getDocs(this._colRef(this.paths.legacyLibraryCol));
        if (newLib.size === 0 && legacy.size > 0) {
          for (const d of legacy.docs) await addDoc(this._colRef(this.paths.libraryCol), { ...d.data() });
          results.actions.push(`Migrated ${legacy.size} legacy library -> content/library/items`);
        } else results.actions.push('Library migration not needed');
      } catch (e) { results.errors.push(`Migrate library: ${e.message}`); }

      // Migrate legacy courses array to subcollection
      try {
        const edDoc = await getDoc(this._docRef(this.paths.educationDoc));
        const newCourses = await getDocs(this._colRef(this.paths.educationCoursesCol));
        if (edDoc.exists() && newCourses.size === 0) {
          const data = edDoc.data();
          if (Array.isArray(data.courses) && data.courses.length > 0) {
            for (const c of data.courses) await addDoc(this._colRef(this.paths.educationCoursesCol), c);
            results.actions.push(`Migrated ${data.courses.length} legacy courses -> content/education/courses`);
          } else results.actions.push('Courses migration not needed');
        } else results.actions.push('Courses subcollection already populated');
      } catch (e) { results.errors.push(`Migrate courses: ${e.message}`); }

      if (results.errors.length > 0) results.success = false;
      return results;
    } catch (error) {
      return { success: false, actions: results.actions, errors: [...results.errors, error.message] };
    }
  }
}

window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;
