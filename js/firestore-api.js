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
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { uploadFileChunks as storeFileChunks, fetchFileChunks as readFileChunks } from "./file-chunks.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAvPMOgz1w7SFylBY8cmn9nf9GQvn-IRNI",
  authDomain: "space-42d87.firebaseapp.com",
  projectId: "space-42d87",
  storageBucket: "space-42d87.firebasestorage.app",
  messagingSenderId: "658382934950",
  appId: "1:658382934950:web:c61b6fa237b203e6bf7567",
  measurementId: "G-Q7Y482TMEY"
};

// Initialize Firebase (with error handling for multiple initializations)
let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
const db = getFirestore(app);
const storage = getStorage(app);

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
  imageUrl: toStr(e.imageUrl),
  description: toStr(e.description),
  registerUrl: toStr(e.registerUrl),
  detailsUrl: toStr(e.detailsUrl),
  galleryUrl: toStr(e.galleryUrl)
});
const sanitizeLibrary = (r) => ({
  name: toStr(r.name),
  type: toStr(r.type || "Book"),
  tags: toArr(r.tags),
  image: toStr(r.image),
  imageUrl: toStr(r.imageUrl),
  description: toStr(r.description),
  link: toStr(r.link)
});
const sanitizeArticle = (a) => ({
  title: toStr(a.title),
  author: toStr(a.author),
  date: toStr(a.date),
  summary: toStr(a.summary),
  content: toStr(a.content),
  imageUrl: toStr(a.imageUrl),
  readMoreUrl: toStr(a.readMoreUrl),
  language: toStr(a.language || 'en'),
  defaultLanguage: toStr(a.defaultLanguage || a.language || 'en'),
  translations: a.translations && typeof a.translations === 'object' ? a.translations : {}
});
const sanitizeCourse = (c) => ({
  title: toStr(c.title),
  description: toStr(c.description),
  lecturer: toStr(c.lecturer),
  link: toStr(c.link),
  imageUrl: toStr(c.imageUrl),
  enrollUrl: toStr(c.enrollUrl)
});
const sanitizeWeekly = (w) => ({
  weekTitle: toStr(w.weekTitle),
  lecturerName: toStr(w.lecturerName),
  description: toStr(w.description),
  workshopUrl: toStr(w.workshopUrl)
});
const sanitizeFbdEvent = (e) => sanitizeEvent(e);
const sanitizeModel3D = (m) => ({
  code: toStr(m.code).trim(),
  name: toStr(m.name),
  date: toStr(m.date),
  tags: toArr(m.tags)
});

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
      fbdEventsCol: ['content', 'fbd', 'events'],
      modelsDoc: ['content', 'models3d'],
      modelsCol: ['content', 'models3d', 'items']
    };
  }

  _docRef(pathArr) { return doc(this.db, ...pathArr); }
  _colRef(pathArr) { return collection(this.db, ...pathArr); }
  validateRequiredFields = validateRequiredFields;

  // Shared Base64 chunk storage API used by background uploads and viewers.
  generateId(pathArray) {
    return doc(collection(this.db, ...pathArray)).id;
  }

  uploadFileChunks(pathArray, docId, subcollectionName, base64Data) {
    return storeFileChunks(pathArray, docId, subcollectionName, base64Data);
  }

  fetchFileChunks(pathArray, docId, subcollectionName) {
    return readFileChunks(pathArray, docId, subcollectionName);
  }

  async uploadGalleryImages(pathArray, docId, base64Images, onProgress = null) {
    const galleryPath = [...pathArray, docId, 'galleryImages'];
    const existing = await getDocs(this._colRef(galleryPath));
    const nextIndex = existing.docs.reduce(
      (max, item) => Math.max(max, Number(item.data().index) || -1), -1
    ) + 1;

    for (let index = 0; index < base64Images.length; index += 1) {
      const galleryIndex = nextIndex + index;
      await storeFileChunks(galleryPath, `image_${galleryIndex}`, 'chunks', base64Images[index]);
      await setDoc(this._docRef([...galleryPath, `image_${galleryIndex}`]), { index: galleryIndex }, { merge: true });
      if (onProgress) onProgress(index + 1, base64Images.length);
    }
    await setDoc(this._docRef([...pathArray, docId]), { hasGalleryImages: base64Images.length > 0 }, { merge: true });
    return { count: base64Images.length };
  }

  async fetchGalleryImages(pathArray, docId) {
    const images = [];
    const parent = await getDoc(this._docRef([...pathArray, docId]));
    if (!parent.exists()) return images;
    const parentData = parent.data() || {};

    if (parentData.hasImageChunks) {
      const mainImage = await readFileChunks(pathArray, docId, 'imageChunks');
      if (mainImage) images.push(mainImage);
    } else if (parentData.imageUrl) {
      images.push(parentData.imageUrl);
    }

    const gallerySnap = await getDocs(this._colRef([...pathArray, docId, 'galleryImages']));
    const galleryDocs = gallerySnap.docs.sort((a, b) => Number(a.data().index) - Number(b.data().index));
    for (const galleryDoc of galleryDocs) {
      const image = await readFileChunks(
        [...pathArray, docId, 'galleryImages'], galleryDoc.id, 'chunks'
      );
      if (image) images.push(image);
    }
    return images;
  }

  async listStoredImages(pathArray, docId) {
    const entries = [];
    const parent = await getDoc(this._docRef([...pathArray, docId]));
    if (!parent.exists()) return entries;
    const data = parent.data() || {};
    if (data.hasImageChunks) {
      const main = await readFileChunks(pathArray, docId, 'imageChunks');
      if (main) entries.push({ type: 'main', id: 'main', data: main });
    }
    const gallery = await getDocs(this._colRef([...pathArray, docId, 'galleryImages']));
    for (const item of gallery.docs.sort((a, b) => Number(a.data().index) - Number(b.data().index))) {
      const image = await readFileChunks([...pathArray, docId, 'galleryImages'], item.id, 'chunks');
      if (image) entries.push({ type: 'gallery', id: item.id, data: image, index: item.data().index });
    }
    return entries;
  }

  async deleteStoredImage(pathArray, docId, type, imageId = null) {
    if (type === 'main') {
      const chunks = await getDocs(this._colRef([...pathArray, docId, 'imageChunks']));
      await Promise.all(chunks.docs.map(chunk => deleteDoc(chunk.ref)));
      await setDoc(this._docRef([...pathArray, docId]), { hasImageChunks: false }, { merge: true });
      return;
    }
    const imageRef = this._docRef([...pathArray, docId, 'galleryImages', imageId]);
    const chunks = await getDocs(this._colRef([...pathArray, docId, 'galleryImages', imageId, 'chunks']));
    await Promise.all(chunks.docs.map(chunk => deleteDoc(chunk.ref)));
    await deleteDoc(imageRef);
    const remaining = await getDocs(this._colRef([...pathArray, docId, 'galleryImages']));
    await setDoc(this._docRef([...pathArray, docId]), { hasGalleryImages: !remaining.empty }, { merge: true });
  }

  async reorderGalleryImages(pathArray, docId, imageId, direction) {
    const galleryPath = [...pathArray, docId, 'galleryImages'];
    const snapshot = await getDocs(this._colRef(galleryPath));
    const items = snapshot.docs
      .map(item => ({ id: item.id, index: Number(item.data().index) || 0 }))
      .sort((a, b) => a.index - b.index);
    const current = items.findIndex(item => item.id === imageId);
    const target = current + (direction === 'up' ? -1 : 1);
    if (current < 0 || target < 0 || target >= items.length) return;
    const currentItem = items[current];
    const targetItem = items[target];
    await Promise.all([
      setDoc(this._docRef([...galleryPath, currentItem.id]), { index: targetItem.index }, { merge: true }),
      setDoc(this._docRef([...galleryPath, targetItem.id]), { index: currentItem.index }, { merge: true })
    ]);
  }

  async makeGalleryImageThumbnail(pathArray, docId, imageId) {
    const galleryPath = [...pathArray, docId, 'galleryImages'];
    const selected = await readFileChunks(galleryPath, imageId, 'chunks');
    if (!selected) throw new Error('Gallery image was not found.');

    const parent = await getDoc(this._docRef([...pathArray, docId]));
    const parentData = parent.exists() ? parent.data() || {} : {};
    const oldThumbnail = parentData.hasImageChunks
      ? await readFileChunks(pathArray, docId, 'imageChunks')
      : '';

    await storeFileChunks(pathArray, docId, 'imageChunks', selected);
    if (oldThumbnail) {
      const selectedDoc = await getDoc(this._docRef([...galleryPath, imageId]));
      const selectedIndex = selectedDoc.exists() ? Number(selectedDoc.data().index) || 0 : 0;
      await storeFileChunks(galleryPath, imageId, 'chunks', oldThumbnail);
      await setDoc(this._docRef([...galleryPath, imageId]), { index: selectedIndex }, { merge: true });
    } else {
      await this.deleteStoredImage(pathArray, docId, 'gallery', imageId);
    }
  }

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
      await setDoc(eduRef, { weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "", workshopUrl: "" } });
    } else {
      const current = eduSnap.data() || {};
      const ww = current.weeklyWorkshop || {};
      const wwPatches = {};
      if (ww.weekTitle === undefined) wwPatches.weekTitle = "";
      if (ww.lecturerName === undefined) wwPatches.lecturerName = "";
      if (ww.description === undefined) wwPatches.description = "";
      if (ww.workshopUrl === undefined) wwPatches.workshopUrl = "";
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

    await ensure(this.paths.modelsDoc, { createdAt: Date.now() });
  }

  // Read all content (current structure only)
  async getAllContent() {
    try {
      const safeGetDocs = (ref) => getDocs(ref).catch(err => { console.warn('[Firestore API] getDocs skipped:', err); return { docs: [] }; });
      const safeGetDoc = (ref) => getDoc(ref).catch(err => { console.warn('[Firestore API] getDoc skipped:', err); return { exists: () => false, data: () => ({}) }; });

      const [
        eventsSnap,
        librarySnap,
        magazineDocSnap,
        magazineArticlesSnap,
        educationDocSnap,
        coursesSnap,
        fbdDocSnap,
        fbdEventsSnap,
        modelsSnap
      ] = await Promise.all([
        safeGetDocs(this._colRef(this.paths.eventsCol)),
        safeGetDocs(this._colRef(this.paths.libraryCol)),
        safeGetDoc(this._docRef(this.paths.magazineDoc)),
        safeGetDocs(this._colRef(this.paths.magazineArticlesCol)),
        safeGetDoc(this._docRef(this.paths.educationDoc)),
        safeGetDocs(this._colRef(this.paths.educationCoursesCol)),
        safeGetDoc(this._docRef(this.paths.fbdDoc)),
        safeGetDocs(this._colRef(this.paths.fbdEventsCol)),
        safeGetDocs(this._colRef(this.paths.modelsCol))
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
      const education = { weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "", workshopUrl: "" }, courses: [], fbd: { pageTitle: "", about: "", stats: { projectsCompleted: "0", studentsInvolved: "0", communityServed: "0" }, events: [] } };
      if (educationDocSnap.exists()) {
        const ed = educationDocSnap.data();
        const ww = ed.weeklyWorkshop || {};
        education.weeklyWorkshop = {
          weekTitle: ww.weekTitle ?? "",
          lecturerName: ww.lecturerName ?? "",
          description: ww.description ?? "",
          workshopUrl: ww.workshopUrl ?? ""
        };
      }
      education.courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (fbdDocSnap.exists()) {
        const f = fbdDocSnap.data();
        education.fbd.pageTitle = f.pageTitle ?? "";
        education.fbd.about = f.about ?? "";
        education.fbd.stats = f.stats || education.fbd.stats;
      }
      education.fbd.events = fbdEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const models3d = modelsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return { success: true, content: { events, magazine, library, education, models3d } };
    } catch (error) {
      console.error('[Firestore API] getAllContent error:', error);
      return { success: false, error: error.message };
    }
  }

  // EVENTS (stored at content/events/items)

  async addEvent(event, id = null) {
  logPayload('[FirestoreAPI] addEvent raw input', event);
  const payload = sanitizeEvent(event);
  logPayload('[FirestoreAPI] addEvent payload', payload);
  const v = this.validateRequiredFields(payload, ['title','time','location','description']);
  if (!v.valid) return { success: false, error: v.message };
  try {
    let refId;
    if (id) {
        await setDoc(doc(this.db, ...this.paths.eventsCol, id), payload);
        refId = id;
    } else {
        const ref = await addDoc(this._colRef(this.paths.eventsCol), payload);
        refId = ref.id;
    }
    return { success: true, id: refId, message: 'Event added successfully' };
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
  async addLibraryResource(resource, id = null) {
    const payload = sanitizeLibrary(resource);
    const v = this.validateRequiredFields(payload, ['name','type','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const refId = id || (await addDoc(this._colRef(this.paths.libraryCol), payload)).id;
      if (id) await setDoc(this._docRef([...this.paths.libraryCol, id]), payload, { merge: true });
      return { success: true, id: refId, message: 'Library resource added successfully' };
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
  async addArticle(article, id = null) {
    const payload = sanitizeArticle(article);
    const v = this.validateRequiredFields(payload, ['title','author','date','summary','content']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const refId = id || (await addDoc(this._colRef(this.paths.magazineArticlesCol), payload)).id;
      if (id) await setDoc(this._docRef([...this.paths.magazineArticlesCol, id]), payload, { merge: true });
      return { success: true, id: refId, message: 'Article added successfully' };
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
  async addCourse(course, id = null) {
    const payload = sanitizeCourse(course);
    const v = this.validateRequiredFields(payload, ['title','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const refId = id || (await addDoc(this._colRef(this.paths.educationCoursesCol), payload)).id;
      if (id) await setDoc(this._docRef([...this.paths.educationCoursesCol, id]), payload, { merge: true });
      return { success: true, id: refId, message: 'Course added successfully' };
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
      await setDoc(this._docRef(this.paths.fbdDoc), { pageTitle: toStr(pageTitle), about: toStr(about) }, { merge: true });
      return { success: true, message: 'FBD page updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateFbdStats({ projectsCompleted, studentsInvolved, communityServed }) {
    try {
      await setDoc(this._docRef(this.paths.fbdDoc), {
        stats: {
          projectsCompleted: toStr(projectsCompleted),
          studentsInvolved: toStr(studentsInvolved),
          communityServed: toStr(communityServed)
        }
      }, { merge: true });
      return { success: true, message: 'FBD statistics updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async addFbdEvent(event, id = null) {
    const payload = sanitizeFbdEvent(event);
    const v = this.validateRequiredFields(payload, ['title','time','location','description']);
    if (!v.valid) return { success: false, error: v.message };
    try {
      let refId;
      if (id) {
          await setDoc(doc(this.db, ...this.paths.fbdEventsCol, id), payload);
          refId = id;
      } else {
          const ref = await addDoc(this._colRef(this.paths.fbdEventsCol), payload);
          refId = ref.id;
      }
      return { success: true, id: refId, message: 'FBD event added successfully' };
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

  // 3D MODELS (stored at content/models3d/items)
  async isModelCodeTaken(code, excludeId = null) {
    try {
      const normalizedCode = toStr(code).trim().toUpperCase();
      if (!normalizedCode) return false;
      const snap = await getDocs(this._colRef(this.paths.modelsCol));
      return snap.docs.some(d => {
        if (excludeId && d.id === excludeId) return false;
        const data = d.data() || {};
        return toStr(data.code).trim().toUpperCase() === normalizedCode;
      });
    } catch {
      return false;
    }
  }

  async addModel3D(model, id = null) {
    const payload = sanitizeModel3D(model);
    const v = this.validateRequiredFields(payload, ['code', 'name', 'date']);
    if (!v.valid) return { success: false, error: v.message };
    if (payload.code.length !== 10) {
      return { success: false, error: 'Model code must be exactly 10 characters.' };
    }
    try {
      const codeTaken = await this.isModelCodeTaken(payload.code);
      if (codeTaken) return { success: false, error: 'This model code already exists.' };
      const refId = id || (await addDoc(this._colRef(this.paths.modelsCol), payload)).id;
      if (id) await setDoc(this._docRef([...this.paths.modelsCol, id]), payload, { merge: true });
      return { success: true, id: refId, message: '3D model added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateModel3D(id, model) {
    try {
      const payload = sanitizeModel3D(model);
      const v = this.validateRequiredFields(payload, ['code', 'name', 'date']);
      if (!v.valid) return { success: false, error: v.message };
      if (payload.code.length !== 10) {
        return { success: false, error: 'Model code must be exactly 10 characters.' };
      }
      const codeTaken = await this.isModelCodeTaken(payload.code, id);
      if (codeTaken) return { success: false, error: 'This model code already exists.' };

      await updateDoc(this._docRef([...this.paths.modelsCol, id]), payload);
      return { success: true, message: '3D model updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteModel3D(id) {
    try {
      await deleteDoc(this._docRef([...this.paths.modelsCol, id]));
      return { success: true, message: '3D model deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fetchModel3DFileByCode(code) {
    const normalizedCode = toStr(code).trim().toUpperCase();
    if (!normalizedCode) return '';
    const snapshot = await getDocs(this._colRef(this.paths.modelsCol));
    const model = snapshot.docs.find(item => toStr(item.data().code).trim().toUpperCase() === normalizedCode);
    if (!model) return '';
    return readFileChunks(this.paths.modelsCol, model.id, 'fileChunks');
  }

  async uploadModel3DFile(docId, base64Data, mimeType = 'model/gltf-binary') {
    await storeFileChunks(this.paths.modelsCol, docId, 'fileChunks', base64Data);
    await setDoc(this._docRef([...this.paths.modelsCol, docId]), {
      hasFile: true,
      fileMimeType: mimeType
    }, { merge: true });
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
    const startedAt = performance.now();
    const checks = await Promise.allSettled([
      getDoc(doc(this.db, 'content', 'events')),
      getDoc(doc(this.db, 'config', 'admins'))
    ]);
    const labels = ['Firestore database', 'Administrator access'];
    const details = checks.map((result, index) => ({
      label: labels[index],
      success: result.status === 'fulfilled',
      detail: result.status === 'fulfilled'
        ? (result.value.exists() ? 'Readable' : 'Reachable (document not created yet)')
        : (result.reason?.message || 'Request failed')
    }));
    const success = details.every(check => check.success);
    return {
      success,
      message: success ? 'Firestore is connected and administrator access is working.' : 'One or more Firestore checks failed.',
      error: success ? '' : details.filter(check => !check.success).map(check => check.detail).join(' '),
      projectId: app.options.projectId || '',
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      checkedAt: new Date().toISOString(),
      checks: details
    };
  }

  // Define the required docs, required fields, and subcollections (no legacy)
  getExpectedStructure() {
    return {
      contentDocs: {
        events:   { createdAt: 0 },
        library:  { createdAt: 0 },
        magazine: { featuredArticleId: null, releases: [] },
        education:{ weeklyWorkshop: { weekTitle: "", lecturerName: "", description: "", workshopUrl: "" } },
        fbd:      { pageTitle: "", about: "" },
        models3d: { createdAt: 0 }
      },
      subcollections: [
        { parent: ['content', 'events'], name: 'items', defaultsKey: 'events' },
        { parent: ['content', 'library'], name: 'items', defaultsKey: 'library' },
        { parent: ['content', 'magazine'], name: 'articles', defaultsKey: 'articles' },
        { parent: ['content', 'education'], name: 'courses', defaultsKey: 'courses' },
        { parent: ['content', 'fbd'], name: 'events', defaultsKey: 'fbdEvents' },
        { parent: ['content', 'models3d'], name: 'items', defaultsKey: 'models3d' }
      ],
      // Per-item required/default fields used for backfill
      itemDefaults: {
        events:   { title: "", time: "", location: "", type: "Workshop", seats: 0, image: "", imageUrl: "", description: "", registerUrl: "", detailsUrl: "", galleryUrl: "" },
        library:  { name: "", type: "Book", tags: [], image: "", imageUrl: "", description: "", link: "" },
        articles: { title: "", author: "", date: "", summary: "", content: "", imageUrl: "", readMoreUrl: "" },
        courses:  { title: "", description: "", lecturer: "", link: "", imageUrl: "", enrollUrl: "" },
        fbdEvents:{ title: "", time: "", location: "", type: "Workshop", seats: 0, image: "", imageUrl: "", description: "", registerUrl: "", detailsUrl: "", galleryUrl: "" },
        models3d: { code: "", name: "", date: "", tags: [] }
      }
    };
  }

  // Read-only inspection used by the dashboard before it offers a repair.
  async inspectStructure() {
    const expected = this.getExpectedStructure();
    const result = {
      success: true,
      healthy: true,
      projectId: app.options.projectId || '',
      checkedAt: new Date().toISOString(),
      documents: [],
      collections: [],
      issues: [],
      errors: [],
      repairableIssues: 0,
      summary: { baseDocuments: 0, contentEntries: 0, documentsNeedingRepair: 0, missingFields: 0 }
    };

    const missingKeys = (data, defaults, prefix = '') => {
      const missing = [];
      for (const [key, defaultValue] of Object.entries(defaults)) {
        const field = prefix ? `${prefix}.${key}` : key;
        if (data?.[key] === undefined || data?.[key] === null) {
          missing.push(field);
        } else if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
          missing.push(...missingKeys(data[key], defaultValue, field));
        }
      }
      return missing;
    };

    for (const [docName, defaults] of Object.entries(expected.contentDocs)) {
      const path = `content/${docName}`;
      try {
        const snapshot = await getDoc(this._docRef(['content', docName]));
        result.summary.baseDocuments += 1;
        if (!snapshot.exists()) {
          result.documents.push({ path, status: 'missing', missingFields: Object.keys(defaults) });
          result.issues.push(`${path} is missing`);
          result.repairableIssues += 1;
          result.summary.documentsNeedingRepair += 1;
          continue;
        }
        const missing = missingKeys(snapshot.data() || {}, defaults);
        result.documents.push({ path, status: missing.length ? 'needs-repair' : 'ready', missingFields: missing });
        if (missing.length) {
          result.issues.push(`${path} is missing: ${missing.join(', ')}`);
          result.repairableIssues += missing.length;
          result.summary.documentsNeedingRepair += 1;
          result.summary.missingFields += missing.length;
        }
      } catch (error) {
        result.documents.push({ path, status: 'error', missingFields: [] });
        result.errors.push(`${path}: ${error.message}`);
      }
    }

    for (const definition of expected.subcollections) {
      const path = `${definition.parent.join('/')}/${definition.name}`;
      try {
        const snapshot = await getDocs(this._colRef([...definition.parent, definition.name]));
        const defaults = expected.itemDefaults[definition.defaultsKey] || {};
        let affectedDocuments = 0;
        let missingFields = 0;
        snapshot.docs.forEach(item => {
          const missing = missingKeys(item.data() || {}, defaults);
          if (missing.length) {
            affectedDocuments += 1;
            missingFields += missing.length;
            result.issues.push(`${path}/${item.id} is missing: ${missing.join(', ')}`);
          }
        });
        result.summary.contentEntries += snapshot.size;
        result.summary.documentsNeedingRepair += affectedDocuments;
        result.summary.missingFields += missingFields;
        result.repairableIssues += missingFields;
        result.collections.push({ path, count: snapshot.size, affectedDocuments, missingFields, status: missingFields ? 'needs-repair' : 'ready' });
      } catch (error) {
        result.collections.push({ path, count: 0, affectedDocuments: 0, missingFields: 0, status: 'error' });
        result.errors.push(`${path}: ${error.message}`);
      }
    }

    result.success = result.errors.length === 0;
    result.healthy = result.success && result.repairableIssues === 0;
    return result;
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
      await backfillItems(['content','models3d'],  'items',    expected.itemDefaults.models3d);

      if (results.errors.length > 0) results.success = false;
      return results;
    } catch (error) {
      return { success: false, actions: results.actions, errors: [...results.errors, error.message] };
    }
  }

  // ── MARKET STORES ──────────────────────────────────────────
  async getMarketStores(opts = {}) {
    try {
      const snap = await getDocs(collection(this.db, "marketStores"));
      let stores = snap.docs.map(d => {
        const data = d.data() || {};
        const admins = [
          ...toArr(data.storeAdmins),
          ...toArr(data.adminEmails)
        ].map(e => String(e).trim().toLowerCase()).filter(Boolean);
        return {
          id: d.id,
          ...data,
          storeAdmins: admins,
          adminEmails: admins
        };
      });
      if (!opts.includeInactive) {
        stores = stores.filter(s => s.status !== 'inactive');
      }
      return stores;
    } catch (e) {
      console.error("Error fetching market stores:", e);
      return [];
    }
  }

  async getMarketStore(storeId) {
    try {
      const snap = await getDoc(doc(this.db, "marketStores", storeId));
      if (!snap.exists()) return null;
      const data = snap.data() || {};
      const admins = [
        ...toArr(data.storeAdmins),
        ...toArr(data.adminEmails)
      ].map(e => String(e).trim().toLowerCase()).filter(Boolean);
      return {
        id: snap.id,
        ...data,
        storeAdmins: admins,
        adminEmails: admins
      };
    } catch (e) {
      console.error("Error fetching market store:", e);
      return null;
    }
  }

  async createMarketStore(storeData) {
    try {
      const admins = [
        ...toArr(storeData.storeAdmins),
        ...toArr(storeData.adminEmails)
      ].map(e => String(e).trim().toLowerCase()).filter(Boolean);

      const cleanData = {
        name: toStr(storeData.name),
        slug: toStr(storeData.slug || storeData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')),
        bio: toStr(storeData.bio || storeData.description),
        profileImage: toStr(storeData.profileImage),
        bannerImage: toStr(storeData.bannerImage),
        status: storeData.status === 'inactive' ? 'inactive' : 'active',
        storeAdmins: admins,
        adminEmails: admins,
        adminUids: toArr(storeData.adminUids),
        tags: toArr(storeData.tags).length ? storeData.tags : ["Architecture", "3D Models", "CAD", "Templates"],
        types: toArr(storeData.types).length ? storeData.types : ["3D Model", "CAD Block", "Portfolio Template", "Texture", "Render PSD", "Physical Asset"],
        createdBy: toStr(storeData.createdBy),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(this.db, "marketStores"), cleanData);
      return { success: true, id: docRef.id, ...cleanData };
    } catch (e) {
      console.error("Error creating market store:", e);
      throw new Error(e.message || "Failed to create store");
    }
  }

  async updateMarketStore(storeId, patch) {
    try {
      const cleanPatch = { ...patch, updatedAt: new Date().toISOString() };
      if (cleanPatch.storeAdmins !== undefined || cleanPatch.adminEmails !== undefined) {
        const admins = [
          ...toArr(cleanPatch.storeAdmins),
          ...toArr(cleanPatch.adminEmails)
        ].map(e => String(e).trim().toLowerCase()).filter(Boolean);
        cleanPatch.storeAdmins = admins;
        cleanPatch.adminEmails = admins;
      }
      await updateDoc(doc(this.db, "marketStores", storeId), cleanPatch);
      return { success: true };
    } catch (e) {
      console.error("Error updating market store:", e);
      throw new Error(e.message || "Failed to update store");
    }
  }

  async deleteMarketStore(storeId) {
    try {
      await deleteDoc(doc(this.db, "marketStores", storeId));
      return { success: true };
    } catch (e) {
      console.error("Error deleting market store:", e);
      throw new Error(e.message || "Failed to delete store");
    }
  }

  async addStoreAdmin(storeId, email) {
    try {
      const store = await this.getMarketStore(storeId);
      if (!store) throw new Error("Store not found");
      const normalized = String(email).trim().toLowerCase();
      if (!normalized) throw new Error("Invalid email address");

      const current = [
        ...toArr(store.storeAdmins),
        ...toArr(store.adminEmails)
      ].map(e => String(e).trim().toLowerCase()).filter(Boolean);

      const uniqueAdmins = [...new Set([...current, normalized])];

      await updateDoc(doc(this.db, "marketStores", storeId), {
        storeAdmins: uniqueAdmins,
        adminEmails: uniqueAdmins,
        updatedAt: new Date().toISOString()
      });
      return { success: true, storeAdmins: uniqueAdmins, adminEmails: uniqueAdmins };
    } catch (e) {
      console.error("Error adding store admin:", e);
      throw new Error(e.message || "Failed to add store admin");
    }
  }

  async removeStoreAdmin(storeId, email) {
    try {
      const store = await this.getMarketStore(storeId);
      if (!store) throw new Error("Store not found");
      const normalized = String(email).trim().toLowerCase();
      
      const current = [
        ...toArr(store.storeAdmins),
        ...toArr(store.adminEmails)
      ].map(e => String(e).trim().toLowerCase()).filter(Boolean);

      const uniqueAdmins = current.filter(e => e !== normalized);

      await updateDoc(doc(this.db, "marketStores", storeId), {
        storeAdmins: uniqueAdmins,
        adminEmails: uniqueAdmins,
        updatedAt: new Date().toISOString()
      });
      return { success: true, storeAdmins: uniqueAdmins, adminEmails: uniqueAdmins };
    } catch (e) {
      console.error("Error removing store admin:", e);
      throw new Error(e.message || "Failed to remove store admin");
    }
  }

  // ── MARKET ITEMS ───────────────────────────────────────────
  async getMarketItems(storeId = null) {
    try {
      const snap = await getDocs(collection(this.db, "marketItems"));
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (storeId) {
        items = items.filter(it => it.storeId === storeId);
      }
      return items;
    } catch (e) {
      console.error("Error fetching market items:", e);
      return [];
    }
  }

  async getMarketItem(itemId) {
    try {
      const snap = await getDoc(doc(this.db, "marketItems", itemId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (e) {
      console.error("Error fetching market item:", e);
      return null;
    }
  }

  async createMarketItem(itemData) {
    try {
      const cleanData = {
        storeId: toStr(itemData.storeId),
        storeName: toStr(itemData.storeName),
        name: toStr(itemData.name),
        description: toStr(itemData.description),
        image: toStr(itemData.image),
        tag: toStr(itemData.tag || "General"),
        type: toStr(itemData.type || "3D Model"),
        quantity: toNum(itemData.quantity, 1),
        deliverTime: toStr(itemData.deliverTime || "Instant Download"),
        price: toStr(itemData.price || "Free"),
        status: itemData.status === 'hidden' ? 'hidden' : 'active',
        createdBy: toStr(itemData.createdBy),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(this.db, "marketItems"), cleanData);
      return { success: true, id: docRef.id, ...cleanData };
    } catch (e) {
      console.error("Error creating market item:", e);
      return { success: false, error: e.message };
    }
  }

  async updateMarketItem(itemId, patch) {
    try {
      const cleanPatch = { ...patch, updatedAt: new Date().toISOString() };
      await updateDoc(doc(this.db, "marketItems", itemId), cleanPatch);
      return { success: true };
    } catch (e) {
      console.error("Error updating market item:", e);
      return { success: false, error: e.message };
    }
  }

  async deleteMarketItem(itemId) {
    try {
      await deleteDoc(doc(this.db, "marketItems", itemId));
      return { success: true };
    } catch (e) {
      console.error("Error deleting market item:", e);
      return { success: false, error: e.message };
    }
  }

  async setMarketItemStatus(itemId, status) {
    return this.updateMarketItem(itemId, { status });
  }

  async uploadMarketFile(file, path) {
    try {
      const fileRef = storageRef(storage, `market/${path}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);
      return { success: true, url: downloadURL };
    } catch (e) {
      console.error("Storage upload failed, fallback to dataURL:", e);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ success: true, url: reader.result });
        reader.onerror = () => resolve({ success: false, error: "Failed to read file" });
        reader.readAsDataURL(file);
      });
    }
  }

  async createMarketOrder(orderData) {
    try {
      const clean = {
        itemId: toStr(orderData.itemId),
        itemName: toStr(orderData.itemName),
        storeId: toStr(orderData.storeId),
        storeName: toStr(orderData.storeName),
        buyerName: toStr(orderData.buyerName),
        buyerEmail: toStr(orderData.buyerEmail),
        buyerPhone: toStr(orderData.buyerPhone),
        notes: toStr(orderData.notes),
        status: "pending",
        createdAt: new Date().toISOString()
      };
      const ref = await addDoc(collection(this.db, "marketOrders"), clean);
      return { success: true, id: ref.id, ...clean };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ── MARKET TAXONOMY (TAGS & TYPES: SINGLE SOURCE OF TRUTH) ────
  async getMarketTypes() {
    const defaultTypes = [
      { id: "digital_asset", en: "Digital Asset", ar: "أصل رقمي", icon: "💾" },
      { id: "3d_model", en: "3D Model", ar: "نموذج ثلاثي الأبعاد", icon: "🏛️" },
      { id: "cad_template", en: "CAD Template / Block", ar: "قالب أوتوكاد", icon: "📐" },
      { id: "3d_printable", en: "3D Printable", ar: "قابل للطباعة ثلاثية الأبعاد", icon: "🖨️" },
      { id: "textures", en: "Textures & Materials", ar: "خامات ومواد", icon: "🎨" },
      { id: "diagrams", en: "Diagrams & Schemes", ar: "مخططات ورسومات", icon: "📊" },
      { id: "physical_craft", en: "Physical Craft & Tools", ar: "أدوات ومجسمات يدوية", icon: "✂️" },
      { id: "coursework_ref", en: "Coursework Reference", ar: "مراجع دراسية", icon: "📚" },
      { id: "software_plugin", en: "Software Plugin / Script", ar: "إضافات وبرمجيات", icon: "⚡" }
    ];

    try {
      const snap = await getDoc(doc(this.db, "config", "marketTypes"));
      if (snap.exists() && Array.isArray(snap.data().types) && snap.data().types.length > 0) {
        return snap.data().types;
      }
      // Auto-create document in Firestore if missing
      await setDoc(doc(this.db, "config", "marketTypes"), {
        types: defaultTypes,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => null);
      return defaultTypes;
    } catch (e) {
      console.warn("Could not fetch config/marketTypes, using default types:", e);
      return defaultTypes;
    }
  }

  async saveMarketTypes(types) {
    try {
      const cleanTypes = (types || []).map(t => ({
        id: toStr(t.id || t.en.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
        en: toStr(t.en),
        ar: toStr(t.ar || t.en),
        icon: toStr(t.icon || "📦")
      })).filter(t => t.en.length > 0);

      await setDoc(doc(this.db, "config", "marketTypes"), {
        types: cleanTypes,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { success: true, types: cleanTypes };
    } catch (e) {
      console.error("Error saving market types:", e);
      return { success: false, error: e.message };
    }
  }

  async addMarketTypeIfMissing(newType) {
    try {
      const current = await this.getMarketTypes();
      const enName = String(newType.en || newType).trim();
      if (!enName) return current;
      const exists = current.some(t => t.en.toLowerCase() === enName.toLowerCase());
      if (!exists) {
        const id = enName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        current.push({
          id,
          en: enName,
          ar: String(newType.ar || enName).trim(),
          icon: String(newType.icon || "📦").trim()
        });
        await this.saveMarketTypes(current);
      }
      return current;
    } catch (e) {
      console.warn("Could not auto-append market type:", e);
      return [];
    }
  }

  async getMarketTags() {
    const defaultTags = [
      { id: "cad_blocks", en: "CAD Blocks", ar: "بلوكات كاد" },
      { id: "3d_models", en: "3D Models", ar: "نماذج ثلاثية الأبعاد" },
      { id: "textures", en: "Textures & Materials", ar: "خامات ومواد" },
      { id: "diagrams", en: "Diagrams & Schemes", ar: "مخططات ورسومات" },
      { id: "templates", en: "Portfolio Templates", ar: "قوالب بورتفوليو" },
      { id: "physical_craft", en: "Physical Material", ar: "أدوات ومجسمات يدوية" },
      { id: "software_plugins", en: "Software & Plugins", ar: "برمجيات وإضافات" },
      { id: "coursework", en: "Coursework Reference", ar: "مراجع دراسية" },
      { id: "urban_design", en: "Urban Design & Maps", ar: "تخطيط عمراني وخرائط" }
    ];

    try {
      const snap = await getDoc(doc(this.db, "config", "marketTags"));
      if (snap.exists() && Array.isArray(snap.data().tags) && snap.data().tags.length > 0) {
        return snap.data().tags;
      }
      // Auto-create document in Firestore if missing
      await setDoc(doc(this.db, "config", "marketTags"), {
        tags: defaultTags,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => null);
      return defaultTags;
    } catch (e) {
      console.warn("Could not fetch config/marketTags, using default tags:", e);
      return defaultTags;
    }
  }

  async saveMarketTags(tags) {
    try {
      const cleanTags = (tags || []).map(t => ({
        id: toStr(t.id || t.en.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
        en: toStr(t.en),
        ar: toStr(t.ar || t.en)
      })).filter(t => t.en.length > 0);

      await setDoc(doc(this.db, "config", "marketTags"), {
        tags: cleanTags,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { success: true, tags: cleanTags };
    } catch (e) {
      console.error("Error saving market tags:", e);
      return { success: false, error: e.message };
    }
  }

  async addMarketTagIfMissing(newTag) {
    try {
      const current = await this.getMarketTags();
      const enName = String(newTag.en || newTag).trim();
      if (!enName) return current;
      const exists = current.some(t => t.en.toLowerCase() === enName.toLowerCase());
      if (!exists) {
        const id = enName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        current.push({
          id,
          en: enName,
          ar: String(newTag.ar || enName).trim()
        });
        await this.saveMarketTags(current);
      }
      return current;
    } catch (e) {
      console.warn("Could not auto-append market tag:", e);
      return [];
    }
  }
}

window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;

