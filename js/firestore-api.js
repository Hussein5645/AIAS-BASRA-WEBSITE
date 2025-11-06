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
try {
  app = getApp();
} catch (error) {
  app = initializeApp(firebaseConfig);
}
const db = getFirestore(app);

class FirestoreAPI {
  constructor() {
    this.db = db;

    // New standardized paths under content/
    this.paths = {
      content: 'content',
      eventsDoc: ['content', 'events'], // document path
      eventsCol: ['content', 'events', 'items'], // subcollection for events
      libraryDoc: ['content', 'library'],
      libraryCol: ['content', 'library', 'items'],
      magazineDoc: ['content', 'magazine'],
      magazineArticlesCol: ['content', 'magazine', 'articles'],
      educationDoc: ['content', 'education'],
      educationCoursesCol: ['content', 'education', 'courses'],
      fbdDoc: ['content', 'fbd'],
      fbdEventsCol: ['content', 'fbd', 'events'],

      // Legacy collections for migration/back-compat
      legacyEventsCol: ['events'],
      legacyLibraryCol: ['library']
    };
  }

  // Helper: path builders
  _docRef(pathArr) {
    return doc(this.db, ...pathArr);
  }
  _colRef(pathArr) {
    return collection(this.db, ...pathArr);
  }

  /**
   * Validate that an object has no empty required fields
   */
  validateRequiredFields(obj, requiredFields) {
    const emptyFields = [];
    for (const field of requiredFields) {
      const value = obj[field];
      if (value === undefined || value === null) {
        emptyFields.push(field);
        continue;
      }
      if (typeof value === 'string' && value.trim() === '') {
        emptyFields.push(field);
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        emptyFields.push(field);
        continue;
      }
    }
    if (emptyFields.length > 0) {
      return { valid: false, message: `Missing or empty required fields: ${emptyFields.join(', ')}` };
    }
    return { valid: true, message: '' };
  }

  /**
   * Ensure base content docs exist
   */
  async ensureBaseDocs() {
    // Create empty documents if not present
    const ensureDoc = async (pathArr, defaultData) => {
      const r = this._docRef(pathArr);
      const s = await getDoc(r);
      if (!s.exists()) {
        await setDoc(r, defaultData || {});
      }
    };

    await ensureDoc(this.paths.eventsDoc, { createdAt: Date.now() });
    await ensureDoc(this.paths.libraryDoc, { createdAt: Date.now() });
    await ensureDoc(this.paths.magazineDoc, {
      featuredArticleId: null,
      releases: []
    });
    await ensureDoc(this.paths.educationDoc, {
      weeklyWorkshop: {},
      courses: [] // legacy support
    });
    await ensureDoc(this.paths.fbdDoc, {
      pageTitle: "",
      about: ""
    });
  }

  /**
   * Get all content data with back-compat for legacy structure
   */
  async getAllContent() {
    try {
      await this.ensureBaseDocs();

      const [
        // New structure reads
        eventsSnap,
        librarySnap,
        magazineDocSnap,
        magazineArticlesSnap,
        educationDocSnap,
        coursesSnap,
        fbdDocSnap,
        fbdEventsSnap,

        // Legacy reads for migration/back-compat
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

      // Events
      let events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (events.length === 0 && legacyEventsSnap.size > 0) {
        events = legacyEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Library
      let library = librarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (library.length === 0 && legacyLibrarySnap.size > 0) {
        library = legacyLibrarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Magazine
      let magazine = {
        featuredArticleId: null,
        articles: [],
        releases: []
      };
      if (magazineDocSnap.exists()) {
        const md = magazineDocSnap.data();
        magazine.featuredArticleId = md.featuredArticleId ?? null;
        magazine.releases = md.releases ?? [];
      }
      const articles = magazineArticlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      magazine.articles = articles;

      // Education
      let education = {
        weeklyWorkshop: {},
        courses: [],
        fbd: { pageTitle: "", about: "", events: [] }
      };
      if (educationDocSnap.exists()) {
        const ed = educationDocSnap.data();
        education.weeklyWorkshop = ed.weeklyWorkshop ?? {};
        // legacy array support
        if (Array.isArray(ed.courses) && ed.courses.length > 0) {
          education.courses = ed.courses.map((c, idx) => ({ id: c.id || String(idx), ...c }));
        }
      }
      const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (courses.length > 0) education.courses = courses; // prefer subcollection

      // FBD
      if (fbdDocSnap.exists()) {
        const f = fbdDocSnap.data();
        education.fbd.pageTitle = f.pageTitle ?? "";
        education.fbd.about = f.about ?? "";
      }
      education.fbd.events = fbdEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return { success: true, content: { events, magazine, library, education } };
    } catch (error) {
      console.error('[Firestore API] Error in getAllContent:', error);
      return { success: false, error: error.message };
    }
  }

  // EVENTS (content/events/items)
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

  async updateEvent(eventId, event) {
    try {
      await updateDoc(this._docRef([...this.paths.eventsCol, eventId]), event);
      return { success: true, message: 'Event updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteEvent(eventId) {
    try {
      await deleteDoc(this._docRef([...this.paths.eventsCol, eventId]));
      return { success: true, message: 'Event deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // LIBRARY (content/library/items)
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

  async updateLibraryResource(resourceId, resource) {
    try {
      await updateDoc(this._docRef([...this.paths.libraryCol, resourceId]), resource);
      return { success: true, message: 'Library resource updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteLibraryResource(resourceId) {
    try {
      await deleteDoc(this._docRef([...this.paths.libraryCol, resourceId]));
      return { success: true, message: 'Library resource deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // MAGAZINE (content/magazine + subcollection content/magazine/articles)
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

  async updateArticle(articleId, updatedArticle) {
    try {
      await updateDoc(this._docRef([...this.paths.magazineArticlesCol, articleId]), updatedArticle);
      return { success: true, message: 'Article updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteArticle(articleId) {
    try {
      await deleteDoc(this._docRef([...this.paths.magazineArticlesCol, articleId]));
      return { success: true, message: 'Article deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // EDUCATION (content/education document + courses subcollection)
  async updateEducation(education) {
    const required = ['weekTitle', 'lecturerName', 'description'];
    const v = this.validateRequiredFields(education, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const edRef = this._docRef(this.paths.educationDoc);
      const edSnap = await getDoc(edRef);
      const existing = edSnap.exists() ? edSnap.data() : { weeklyWorkshop: {}, courses: [] };
      const updated = { ...existing, weeklyWorkshop: education };
      await setDoc(edRef, updated);
      return { success: true, message: 'Education content updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Courses CRUD (content/education/courses)
  async addCourse(course) {
    const required = ['title', 'description'];
    const v = this.validateRequiredFields(course, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const ref = await addDoc(this._colRef(this.paths.educationCoursesCol), course);
      return { success: true, id: ref.id, message: 'Course added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateCourse(courseId, course) {
    try {
      await updateDoc(this._docRef([...this.paths.educationCoursesCol, courseId]), course);
      return { success: true, message: 'Course updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteCourse(courseId) {
    try {
      await deleteDoc(this._docRef([...this.paths.educationCoursesCol, courseId]));
      return { success: true, message: 'Course deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // FBD (content/fbd doc + content/fbd/events subcollection)
  async updateFbdPage({ pageTitle, about }) {
    try {
      await setDoc(this._docRef(this.paths.fbdDoc), {
        pageTitle: pageTitle ?? "",
        about: about ?? ""
      }, { merge: true });
      return { success: true, message: 'FBD page updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async addFbdEvent(event) {
    const required = ['title', 'time', 'location', 'description'];
    const v = this.validateRequiredFields(event, required);
    if (!v.valid) return { success: false, error: v.message };
    try {
      const ref = await addDoc(this._colRef(this.paths.fbdEventsCol), event);
      return { success: true, id: ref.id, message: 'FBD event added successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateFbdEvent(eventId, event) {
    try {
      await updateDoc(this._docRef([...this.paths.fbdEventsCol, eventId]), event);
      return { success: true, message: 'FBD event updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteFbdEvent(eventId) {
    try {
      await deleteDoc(this._docRef([...this.paths.fbdEventsCol, eventId]));
      return { success: true, message: 'FBD event deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Token compatibility (not used)
  hasToken() { return true; }
  async getFileContent() { return this.getAllContent(); }
  async updateDataJson(newData) { return this.updateAllContent(newData); }
  setToken(_) {}
  getToken() { return ''; }

  // Bulk updater kept for compatibility (writes magazine and education docs only)
  async updateAllContent(content) {
    try {
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

  // Admin helpers
  async testConnection() {
    try {
      await getDoc(doc(this.db, 'config', 'admins'));
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  /**
   * Validate and fix Firestore structure + migrate legacy data (events, library, courses)
   */
  async validateAndFixStructure() {
    const results = { success: true, actions: [], errors: [] };
    try {
      const expected = this.getExpectedStructure();

      // Ensure content docs
      for (const [docName, defaultData] of Object.entries(expected.contentDocs)) {
        try {
          const ref = this._docRef(['content', docName]);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, defaultData);
            results.actions.push(`Created missing document: content/${docName}`);
          } else {
            results.actions.push(`Validated: content/${docName} exists`);
          }
        } catch (e) {
          results.errors.push(`Error ensuring content/${docName}: ${e.message}`);
        }
      }

      // Validate subcollections by a lightweight list call
      for (const sc of expected.subcollections) {
        try {
          const colRef = collection(this.db, ...sc.parent, sc.name);
          const snap = await getDocs(colRef);
          results.actions.push(`Validated: ${sc.parent.join('/')}/${sc.name} (${snap.size} docs)`);
        } catch (e) {
          results.errors.push(`Error checking ${sc.parent.join('/')}/${sc.name}: ${e.message}`);
        }
      }

      // Migrate legacy events and library if new subcollections are empty
      try {
        const newEventsSnap = await getDocs(this._colRef(this.paths.eventsCol));
        const legacyEventsSnap = await getDocs(this._colRef(this.paths.legacyEventsCol));
        if (newEventsSnap.size === 0 && legacyEventsSnap.size > 0) {
          for (const d of legacyEventsSnap.docs) {
            await addDoc(this._colRef(this.paths.eventsCol), { ...d.data() });
          }
          results.actions.push(`Migrated ${legacyEventsSnap.size} legacy events -> content/events/items`);
        } else {
          results.actions.push('Events migration not needed');
        }
      } catch (e) {
        results.errors.push(`Error migrating legacy events: ${e.message}`);
      }

      try {
        const newLibSnap = await getDocs(this._colRef(this.paths.libraryCol));
        const legacyLibSnap = await getDocs(this._colRef(this.paths.legacyLibraryCol));
        if (newLibSnap.size === 0 && legacyLibSnap.size > 0) {
          for (const d of legacyLibSnap.docs) {
            await addDoc(this._colRef(this.paths.libraryCol), { ...d.data() });
          }
          results.actions.push(`Migrated ${legacyLibSnap.size} legacy library items -> content/library/items`);
        } else {
          results.actions.push('Library migration not needed');
        }
      } catch (e) {
        results.errors.push(`Error migrating legacy library: ${e.message}`);
      }

      // Migrate legacy courses array from content/education doc to subcollection
      try {
        const edDoc = await getDoc(this._docRef(this.paths.educationDoc));
        const newCoursesSnap = await getDocs(this._colRef(this.paths.educationCoursesCol));
        if (edDoc.exists() && newCoursesSnap.size === 0) {
          const data = edDoc.data();
          if (Array.isArray(data.courses) && data.courses.length > 0) {
            for (const c of data.courses) {
              await addDoc(this._colRef(this.paths.educationCoursesCol), c);
            }
            results.actions.push(`Migrated ${data.courses.length} legacy courses -> content/education/courses`);
          } else {
            results.actions.push('Courses migration not needed');
          }
        } else {
          results.actions.push('Courses subcollection already populated');
        }
      } catch (e) {
        results.errors.push(`Error migrating legacy courses: ${e.message}`);
      }

      if (results.errors.length > 0) results.success = false;
      return results;
    } catch (error) {
      return { success: false, actions: results.actions, errors: [...results.errors, error.message] };
    }
  }

  // Admin list helpers
  async getAdmins() {
    try {
      const adminDoc = await getDoc(doc(this.db, 'config', 'admins'));
      if (adminDoc.exists()) {
        return { success: true, admins: adminDoc.data().admins || [] };
      } else {
        await setDoc(doc(this.db, 'config', 'admins'), { admins: [] });
        return { success: true, admins: [] };
      }
    } catch (error) {
      return { success: false, error: error.message, admins: [] };
    }
  }

  async addAdmin(email) {
    try {
      const emailLower = (email || '').toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLower)) return { success: false, error: 'Invalid email format' };

      const ref = doc(this.db, 'config', 'admins');
      const snap = await getDoc(ref);
      const admins = snap.exists() ? (snap.data().admins || []) : [];
      if (admins.includes(emailLower)) return { success: false, error: 'Email already exists in admin list' };

      admins.push(emailLower);
      await setDoc(ref, { admins });
      return { success: true, admins, message: `Admin ${emailLower} added successfully` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeAdmin(email) {
    try {
      const emailLower = (email || '').toLowerCase().trim();
      const ref = doc(this.db, 'config', 'admins');
      const snap = await getDoc(ref);
      if (!snap.exists()) return { success: false, error: 'Admin list not found' };
      let admins = snap.data().admins || [];
      if (!admins.includes(emailLower)) return { success: false, error: 'Email not found in admin list' };
      admins = admins.filter(a => a !== emailLower);
      await setDoc(ref, { admins });
      return { success: true, admins, message: `Admin ${emailLower} removed successfully` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export
window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;
