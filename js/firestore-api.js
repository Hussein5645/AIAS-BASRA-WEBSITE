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

// Small sanitizers to make sure we always write the user's inputs (no undefineds)
const toStr = (v) => (v === undefined || v === null) ? "" : String(v);
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toArr = (v) => Array.isArray(v) ? v : [];

const sanitizeEvent = (e) => ({
  title: toStr(e.title),
  time: toStr(e.time),
  location: toStr(e.location),
  type: toStr(e.type || "Workshop"),
  seats: toNum(e.seats, 0),
  image: toStr(e.image),
  description: toStr(e.description)
});
const sanitizeLibrary = (r) => ({
  name: toStr(r.name),
  type: toStr(r.type || "Book"),
  tags: toArr(r.tags),
  image: toStr(r.image),
  description: toStr(r.description),
  link: toStr(r.link)
});
const sanitizeArticle = (a) => ({
  title: toStr(a.title),
  author: toStr(a.author),
  date: toStr(a.date),
  summary: toStr(a.summary),
  content: toStr(a.content)
});
const sanitizeCourse = (c) => ({
  title: toStr(c.title),
  description: toStr(c.description),
  lecturer: toStr(c.lecturer),
  link: toStr(c.link)
});
const sanitizeWeekly = (w) => ({
  weekTitle: toStr(w.weekTitle),
  lecturerName: toStr(w.lecturerName),
  description: toStr(w.description)
});
const sanitizeFbdEvent = (e) => sanitizeEvent(e);

const logPayload = (label, data) => {
  try { console.log(label, JSON.stringify(data, null, 2)); }
  catch { console.log(label, data); }
};


// Note: We only treat undefined or null as missing. Empty strings/arrays are allowed.
// This prevents false "Missing field" errors when the UI intentionally sends empty values.
function validateRequiredFields(obj, requiredFields) {
  const missing = [];
  for (const f of requiredFields) {
    const v = obj[f];
    
    const isEmptyArray = Array.isArray(v) && v.length === 0;
    if (v === undefined || v === null || isEmptyArray) {
      missing.push(f);
    }
  }
  if (missing.length) return { valid: false, message: `Missing required fields: ${missing.join(', ')}` };
  return { valid: true, message: '' };
}

class FirestoreAPI {
  constructor() {
    this.db = db;
    this.paths = {
      // Current standardized locations under content/
      eventsDoc: ['content', 'events'],
      eventsCol: ['content', 'events', 'items'],
      libraryDoc: ['content', 'library'],
      libraryCol: ['content', 'library', 'items'],
      magazineDoc: ['content', 'magazine'],
      magazineArticlesCol: ['content', 'magazine', 'articles'],
      educationDoc: ['content', 'education'],
      educationCoursesCol: ['content', 'education', 'courses'],
      fbdDoc: ['content', 'fbd'],
      fbdEventsCol: ['content', 'fbd', 'events']
    };
  }

  _docRef(pathArr) { return doc(this.db, ...pathArr); }
  _colRef(pathArr) { return collection(this.db, ...pathArr); }
  validateRequiredFields = validateRequiredFields;

  // Ensure base docs exist and backfill any missing fields (including nested weeklyWorkshop fields)
  async ensureBaseDocs() {
    const ensure = async (pathArr, data) => {
      const r = this._docRef(pathArr);
      const s = await getDoc(r);
      if (!s.exists()) {
        await setDoc(r, data || {});
      } else if (data && typeof data === 'object') {
        const current = s.data() || {};
        const patches = {};
        for (const [k, v] of Object.entries(data)) {
          if (current[k] === undefined) patches[k] = v;
        }
        if (Object.keys(patches).length) await setDoc(r, patches, { merge: true });
      }
    };

    await ensure(this.paths.eventsDoc,   { createdAt: Date.now() });
    await ensure(this.paths.libraryDoc,  { createdAt: Date.now() });
    await ensure(this.paths.magazineDoc, { featuredArticleId: null, releases: [] });

    // Education doc with nested weeklyWorkshop defaults backfilled
    const eduRef = this._docRef(this.paths.educationDoc);
    const eduSnap = await getDoc(eduRef);
    if (!eduSnap.exists()) {
      await setDoc(eduRef, { weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "" } });
    } else {
      const current = eduSnap.data() || {};
      const ww = current.weeklyWorkshop || {};
      const wwPatches = {};
      if (ww.weekTitle === undefined) wwPatches.weekTitle = "";
      if (ww.lecturerName === undefined) wwPatches.lecturerName = "";
      if (ww.description === undefined) wwPatches.description = "";
      if (Object.keys(wwPatches).length) {
        await setDoc(eduRef, { weeklyWorkshop: { ...ww, ...wwPatches } }, { merge: true });
      }
    }

    // FBD doc
    const fbdRef = this._docRef(this.paths.fbdDoc);
    const fbdSnap = await getDoc(fbdRef);
    if (!fbdSnap.exists()) {
      await setDoc(fbdRef, { pageTitle: "", about: "" });
    } else {
      const cur = fbdSnap.data() || {};
      const patches = {};
      if (cur.pageTitle === undefined) patches.pageTitle = "";
      if (cur.about === undefined) patches.about = "";
      if (Object.keys(patches).length) await setDoc(fbdRef, patches, { merge: true });
    }
  }

  // Read all content (current structure only)
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
        fbdEventsSnap
      ] = await Promise.all([
        getDocs(this._colRef(this.paths.eventsCol)),
        getDocs(this._colRef(this.paths.libraryCol)),
        getDoc(this._docRef(this.paths.magazineDoc)),
        getDocs(this._colRef(this.paths.magazineArticlesCol)),
        getDoc(this._docRef(this.paths.educationDoc)),
        getDocs(this._colRef(this.paths.educationCoursesCol)),
        getDoc(this._docRef(this.paths.fbdDoc)),
        getDocs(this._colRef(this.paths.fbdEventsCol))
      ]);

      // Events
      const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Library
      const library = librarySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Magazine
      const magazine = { featuredArticleId: null, articles: [], releases: [] };
      if (magazineDocSnap.exists()) {
        const md = magazineDocSnap.data();
        magazine.featuredArticleId = md.featuredArticleId ?? null;
        magazine.releases = md.releases ?? [];
      }
      magazine.articles = magazineArticlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Education (weekly + courses subcollection) + FBD
      const education = { weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "" }, courses: [], fbd: { pageTitle: "", about: "", events: [] } };
      if (educationDocSnap.exists()) {
        const ed = educationDocSnap.data();
        const ww = ed.weeklyWorkshop || {};
        education.weeklyWorkshop = {
          weekTitle: ww.weekTitle ?? "",
          lecturerName: ww.lecturerName ?? "",
          description: ww.description ?? ""
        };
      }
      education.courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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

// Example: inside addEvent
async addEvent(event) {
  logPayload('[FirestoreAPI] addEvent raw input', event);
  const payload = sanitizeEvent(event);
  logPayload('[FirestoreAPI] addEvent payload', payload);
  const v = this.validateRequiredFields(payload, ['title','time','location','description']);
  if (!v.valid) return { success: false, error: v.message };
  try {
    await this.ensureBaseDocs();
    const ref = await addDoc(this._colRef(this.paths.eventsCol), payload);
    return { success: true, id: ref.id, message: 'Event added successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
  async updateEvent(id, event) {
    try {
      const payload = sanitizeEvent(event);
      await updateDoc(this._docRef([...this.paths.eventsCol, id]), payload);
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
    const payload = sanitizeLibrary(resource);
    const v = this.validateRequiredFields(payload, ['name','type','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.libraryCol), payload);
      return { success: true, id: ref.id, message: 'Library resource added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateLibraryResource(id, resource) {
    try {
      const payload = sanitizeLibrary(resource);
      await updateDoc(this._docRef([...this.paths.libraryCol, id]), payload);
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
    const payload = sanitizeArticle(article);
    const v = this.validateRequiredFields(payload, ['title','author','date','summary','content']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.magazineArticlesCol), payload);
      return { success: true, id: ref.id, message: 'Article added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateArticle(id, article) {
    try {
      const payload = sanitizeArticle(article);
      await updateDoc(this._docRef([...this.paths.magazineArticlesCol, id]), payload);
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
    const ww = sanitizeWeekly(weeklyWorkshop); // Accept empty strings
    try {
      await this.ensureBaseDocs();
      const ref = this._docRef(this.paths.educationDoc);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : { weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "" } };
      await setDoc(ref, { ...existing, weeklyWorkshop: ww });
      return { success: true, message: 'Education content updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Courses CRUD (content/education/courses)
  async addCourse(course) {
    const payload = sanitizeCourse(course);
    const v = this.validateRequiredFields(payload, ['title','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.educationCoursesCol), payload);
      return { success: true, id: ref.id, message: 'Course added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateCourse(id, course) {
    try {
      const payload = sanitizeCourse(course);
      await updateDoc(this._docRef([...this.paths.educationCoursesCol, id]), payload);
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
      await setDoc(this._docRef(this.paths.fbdDoc), { pageTitle: toStr(pageTitle), about: toStr(about) }, { merge: true });
      return { success: true, message: 'FBD page updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async addFbdEvent(event) {
    const payload = sanitizeFbdEvent(event);
    const v = this.validateRequiredFields(payload, ['title','time','location','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      await this.ensureBaseDocs();
      const ref = await addDoc(this._colRef(this.paths.fbdEventsCol), payload);
      return { success: true, id: ref.id, message: 'FBD event added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateFbdEvent(id, event) {
    try {
      const payload = sanitizeFbdEvent(event);
      await updateDoc(this._docRef([...this.paths.fbdEventsCol, id]), payload);
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

  // Settings helpers (so Settings tab can list admins)
  async getAdmins() {
    try {
      const r = await getDoc(this._docRef(['config', 'admins']));
      if (!r.exists()) return { success: true, admins: [] };
      const data = r.data() || {};
      return { success: true, admins: Array.isArray(data.admins) ? data.admins : [] };
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

  // Bulk updater for top-level docs (magazine + education doc) — lists use subcollections
  async updateAllContent(content) {
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

  // Define the required docs, required fields, and subcollections (no legacy)
  getExpectedStructure() {
    return {
      contentDocs: {
        events:   { createdAt: 0 },
        library:  { createdAt: 0 },
        magazine: { featuredArticleId: null, releases: [] },
        education:{ weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "" } },
        fbd:      { pageTitle: "", about: "" }
      },
      subcollections: [
        { parent: ['content', 'events'], name: 'items' },
        { parent: ['content', 'library'], name: 'items' },
        { parent: ['content', 'magazine'], name: 'articles' },
        { parent: ['content', 'education'], name: 'courses' },
        { parent: ['content', 'fbd'], name: 'events' }
      ],
      // Per-item required/default fields used for backfill
      itemDefaults: {
        events:   { title: "", time: "", location: "", type: "Workshop", seats: 0, image: "", description: "" },
        library:  { name: "", type: "Book", tags: [], image: "", description: "", link: "" },
        articles: { title: "", author: "", date: "", summary: "", content: "" },
        courses:  { title: "", description: "", lecturer: "", link: "" },
        fbdEvents:{ title: "", time: "", location: "", type: "Workshop", seats: 0, image: "", description: "" }
      }
    };
  }

  // Validate and fix Firestore structure (create/backfill current structure and item fields — no legacy)
  async validateAndFixStructure() {
    const results = { success: true, actions: [], errors: [] };
    try {
      const expected = this.getExpectedStructure();

      // Ensure/backfill base documents and required fields
      for (const [docName, defaults] of Object.entries(expected.contentDocs)) {
        try {
          const ref = this._docRef(['content', docName]);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, defaults);
            results.actions.push(`Created content/${docName}`);
          } else {
            // Backfill required fields (including nested weeklyWorkshop)
            const current = snap.data() || {};
            const patches = {};
            for (const [k, v] of Object.entries(defaults)) {
              if (k === 'weeklyWorkshop' && docName === 'education') {
                const ww = current.weeklyWorkshop || {};
                const wwPatches = {};
                for (const [wk, wv] of Object.entries(v)) {
                  if (ww[wk] === undefined) wwPatches[wk] = wv;
                }
                if (Object.keys(wwPatches).length) patches.weeklyWorkshop = { ...ww, ...wwPatches };
              } else if (current[k] === undefined) {
                patches[k] = v;
              }
            }
            if (Object.keys(patches).length) {
              await setDoc(ref, patches, { merge: true });
              results.actions.push(`Backfilled fields in content/${docName}: ${Object.keys(patches).join(', ')}`);
            } else {
              results.actions.push(`Validated content/${docName}`);
            }
          }
        } catch (e) {
          results.errors.push(`Doc content/${docName}: ${e.message}`);
        }
      }

      // Validate subcollections and backfill each item with required UI fields
      const backfillItems = async (parentPath, subName, defaults) => {
        try {
          const colRef = collection(this.db, ...parentPath, subName);
          const snap = await getDocs(colRef);
          let patched = 0;
          await Promise.all(snap.docs.map(async d => {
            const data = d.data() || {};
            const patch = {};
            for (const [k, v] of Object.entries(defaults)) {
              if (data[k] === undefined || data[k] === null) patch[k] = v;
            }
            if (Object.keys(patch).length) {
              await updateDoc(doc(this.db, ...parentPath, subName, d.id), patch);
              patched++;
            }
          }));
          results.actions.push(`Validated ${parentPath.join('/')}/${subName} (${snap.size} docs, backfilled ${patched})`);
        } catch (e) {
          results.errors.push(`Subcollection ${parentPath.join('/')}/${subName}: ${e.message}`);
        }
      };

      await backfillItems(['content','events'],    'items',    expected.itemDefaults.events);
      await backfillItems(['content','library'],   'items',    expected.itemDefaults.library);
      await backfillItems(['content','magazine'],  'articles', expected.itemDefaults.articles);
      await backfillItems(['content','education'], 'courses',  expected.itemDefaults.courses);
      await backfillItems(['content','fbd'],       'events',   expected.itemDefaults.fbdEvents);

      if (results.errors.length > 0) results.success = false;
      return results;
    } catch (error) {
      return { success: false, actions: results.actions, errors: [...results.errors, error.message] };
    }
  }
}

window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;
