// Data Loader - Centralized Firebase Firestore data fetching
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Debug toggle: enable via ?debug=true or localStorage.setItem('debug','true')
const DEBUG =
  (typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('debug') ||
     localStorage.getItem('debug') === 'true'));

const dlog = (...args) => { if (DEBUG) console.log('[Data Loader]', ...args); };

// Initialize Firebase (with error handling for multiple initializations)
console.log('[Data Loader] Initializing Firebase app...');
let app;
try {
    app = getApp();
    console.log('[Data Loader] Using existing Firebase app');
} catch (error) {
    app = initializeApp(firebaseConfig);
    console.log('[Data Loader] Created new Firebase app');
}
const db = getFirestore(app);
console.log('[Data Loader] Firebase initialized successfully');

class DataLoader {
    constructor() {
        this.db = db;
        this.cache = {
            events: null,
            library: null,
            magazine: null,
            education: null,
            about: null,
            home: null,
            lastFetch: null
        };
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Check if cache is still valid
     */
    isCacheValid() {
        if (!this.cache.lastFetch) return false;
        return (Date.now() - this.cache.lastFetch) < this.cacheTimeout;
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache = {
            events: null,
            library: null,
            magazine: null,
            education: null,
            about: null,
            home: null,
            lastFetch: null
        };
        console.log('[Data Loader] Cache cleared');
    }

    /**
     * Fetch all data from Firestore
     */
    async fetchData(forceRefresh = false) {
        dlog('fetchData() called', { forceRefresh });

        if (!forceRefresh && this.isCacheValid()) {
            dlog('Returning cached data');
            return {
                success: true,
                data: this.cache,
                fromCache: true
            };
        }

        try {
            dlog('Fetching fresh data from Firestore...');

            // Fetch events from content subcollection
            dlog('Fetching events from content/events/items...');
            const eventsSnapshot = await getDocs(collection(this.db, 'content/events/items'));
            this.cache.events = eventsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Data Loader] ✓ Loaded ${this.cache.events.length} events from Firestore`);
            if (this.cache.events.length > 0) {
                console.log('[Data Loader] Sample event:', this.cache.events[0]);
            }
            dlog('✓ Loaded events', { count: this.cache.events.length, sample: this.cache.events[0] });

            // Fetch library from content subcollection
            dlog('Fetching library from content/library/items...');
            const librarySnapshot = await getDocs(collection(this.db, 'content/library/items'));
            this.cache.library = librarySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Data Loader] ✓ Loaded ${this.cache.library.length} library items from Firestore`);
            if (this.cache.library.length > 0) {
                console.log('[Data Loader] Sample library item:', this.cache.library[0]);
            }
            dlog('✓ Loaded library items', { count: this.cache.library.length, sample: this.cache.library[0] });

            // Fetch magazine (doc + articles subcollection)
            dlog('Fetching magazine doc...');
            const magazineDocSnap = await getDoc(doc(this.db, 'content', 'magazine'));

            dlog('Fetching magazine articles from content/magazine/articles...');
            const magazineArticlesSnap = await getDocs(collection(this.db, 'content/magazine/articles'));
            const magazineArticles = magazineArticlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            let magazine = { featuredArticle: null, articles: [], releases: [] };
            if (magazineDocSnap.exists()) {
                const md = magazineDocSnap.data() || {};
                magazine.releases = md.releases ?? [];
                const featuredArticleId = md.featuredArticleId ?? null;
                if (featuredArticleId) {
                    magazine.featuredArticle = magazineArticles.find(a => a.id === featuredArticleId) || null;
                }
            }
            // Fallback: if no featured selected, pick first article (if any)
            if (!magazine.featuredArticle && magazineArticles.length > 0) {
                magazine.featuredArticle = magazineArticles[0];
            }
            magazine.articles = magazineArticles;
            this.cache.magazine = magazine;
            console.log(`[Data Loader] ✓ Loaded magazine with ${magazine.articles.length} articles`);
            if (magazine.featuredArticle) {
                console.log('[Data Loader] Featured article:', magazine.featuredArticle.title);
            }
            if (magazine.articles.length > 0) {
                console.log('[Data Loader] Sample article:', magazine.articles[0]);
            }
            dlog('✓ Magazine loaded', {
                articles: magazine.articles.length,
                hasFeatured: !!magazine.featuredArticle,
                featuredId: magazine.featuredArticle?.id
            });

            // Fetch education doc
            dlog('Fetching education doc...');
            const educationDocSnap = await getDoc(doc(this.db, 'content', 'education'));
            const educationBase = educationDocSnap.exists()
                ? (educationDocSnap.data() || {})
                : { weeklyWorkshop: {}, courses: [] };

            // Fetch FBD doc + events and attach under education.fbd for compatibility with pages
            dlog('Fetching FBD doc...');
            const fbdDocSnap = await getDoc(doc(this.db, 'content', 'fbd'));
            dlog('Fetching FBD events from content/fbd/events...');
            const fbdEventsSnap = await getDocs(collection(this.db, 'content/fbd/events'));
            const fbdEvents = fbdEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const fbd = {
                pageTitle: fbdDocSnap.exists() ? (fbdDocSnap.data().pageTitle ?? '') : '',
                about: fbdDocSnap.exists() ? (fbdDocSnap.data().about ?? '') : '',
                events: fbdEvents
            };

            this.cache.education = {
                weeklyWorkshop: {
                    weekTitle: educationBase.weeklyWorkshop?.weekTitle ?? '',
                    lecturerName: educationBase.weeklyWorkshop?.lecturerName ?? '',
                    description: educationBase.weeklyWorkshop?.description ?? '',
                    workshopUrl: educationBase.weeklyWorkshop?.workshopUrl ?? ''
                },
                courses: educationBase.courses ?? [],
                // Attach FBD under education to match page usage
                fbd
            };
            console.log(`[Data Loader] ✓ Loaded education with ${this.cache.education.courses.length} courses`);
            console.log(`[Data Loader] ✓ Loaded FBD with ${this.cache.education.fbd.events.length} events`);
            console.log('[Data Loader] Weekly workshop:', this.cache.education.weeklyWorkshop);
            dlog('✓ Education loaded', {
                hasWeekly: !!this.cache.education.weeklyWorkshop,
                courses: this.cache.education.courses.length,
                fbdEvents: this.cache.education.fbd.events.length
            });

            // Fetch about
            dlog('Fetching about doc...');
            const aboutDoc = await getDoc(doc(this.db, 'content', 'about'));
            this.cache.about = aboutDoc.exists() ? aboutDoc.data() : { story: { paragraphs: [] }, values: [], founders: [], team: [] };
            console.log(`[Data Loader] ✓ Loaded about page (exists: ${aboutDoc.exists()})`);
            dlog('✓ About loaded', { hasStory: !!this.cache.about.story });

            // Fetch home
            dlog('Fetching home doc...');
            const homeDoc = await getDoc(doc(this.db, 'content', 'home'));
            this.cache.home = homeDoc.exists() ? homeDoc.data() : { hero: {}, mission: {} };
            console.log(`[Data Loader] ✓ Loaded home page (exists: ${homeDoc.exists()})`);
            dlog('✓ Home loaded', { hasHero: !!this.cache.home.hero });

            this.cache.lastFetch = Date.now();
            console.log('[Data Loader] ✓ All data loaded and cached successfully');

            return {
                success: true,
                data: this.cache,
                fromCache: false
            };
        } catch (error) {
            console.error('[Data Loader] ✗ Error fetching data:', error);
            console.error('[Data Loader] Error details:', {
                code: error.code,
                message: error.message,
                name: error.name
            });
            return {
                success: false,
                error: error.message,
                errorDetails: {
                    code: error.code,
                    name: error.name
                }
            };
        }
    }

    /**
     * Get events collection
     */
    async getEvents(forceRefresh = false) {
        dlog('getEvents() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                events: result.data.events,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Get library collection
     */
    async getLibrary(forceRefresh = false) {
        dlog('getLibrary() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                library: result.data.library,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Get magazine content (doc + articles)
     */
    async getMagazine(forceRefresh = false) {
        dlog('getMagazine() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                magazine: result.data.magazine,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Get education content (with fbd nested for compatibility)
     */
    async getEducation(forceRefresh = false) {
        dlog('getEducation() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                education: result.data.education,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Get about content
     */
    async getAbout(forceRefresh = false) {
        dlog('getAbout() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                about: result.data.about,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Get home content
     */
    async getHome(forceRefresh = false) {
        dlog('getHome() called');
        const result = await this.fetchData(forceRefresh);
        if (result.success) {
            return {
                success: true,
                home: result.data.home,
                fromCache: result.fromCache
            };
        }
        return result;
    }

    /**
     * Format date string
     */
    formatDate(isoString) {
        // Validate input
        if (!isoString) {
            dlog('formatDate called with null/undefined');
            return null;
        }

        const date = new Date(isoString);

        // Check if date is valid
        if (isNaN(date.getTime())) {
            dlog('Invalid date string:', isoString);
            return null;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

        const currentLang = (typeof localStorage !== 'undefined' ? localStorage.getItem('language') : null) || 'en';
        const monthNames = currentLang === 'ar' ? monthsAr : months;

        return {
            day: date.getDate(),
            month: monthNames[date.getMonth()],
            year: date.getFullYear(),
            monthShort: months[date.getMonth()].toUpperCase(),
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        };
    }

    /**
     * Check if event is past
     */
    isPastEvent(isoString) {
        // Validate input
        if (!isoString) {
            dlog('isPastEvent called with null/undefined');
            return false;
        }

        const date = new Date(isoString);

        // Check if date is valid
        if (isNaN(date.getTime())) {
            dlog('Invalid date string:', isoString);
            return false;
        }

        return date < new Date();
    }
}

// Export singleton instance
const dataLoader = new DataLoader();
export default dataLoader;

// Also export class for creating new instances if needed
export { DataLoader };
