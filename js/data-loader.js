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
        console.log('[Data Loader] fetchData() called');
        
        if (!forceRefresh && this.isCacheValid()) {
            console.log('[Data Loader] Returning cached data');
            return {
                success: true,
                data: this.cache,
                fromCache: true
            };
        }

        try {
            console.log('[Data Loader] Fetching fresh data from Firestore...');
            
            // Fetch events from content subcollection
            console.log('[Data Loader] Fetching events from content/events/items...');
            const eventsSnapshot = await getDocs(collection(this.db, 'content/events/items'));
            this.cache.events = eventsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Data Loader] ✓ Loaded ${this.cache.events.length} events`);

            // Fetch library from content subcollection
            console.log('[Data Loader] Fetching library from content/library/items...');
            const librarySnapshot = await getDocs(collection(this.db, 'content/library/items'));
            this.cache.library = librarySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Data Loader] ✓ Loaded ${this.cache.library.length} library items`);

            // Fetch magazine
            console.log('[Data Loader] Fetching magazine...');
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            this.cache.magazine = magazineDoc.exists() ? magazineDoc.data() : { featuredArticle: null, articles: [], releases: [] };
            console.log(`[Data Loader] ✓ Magazine content loaded`);

            // Fetch education
            console.log('[Data Loader] Fetching education...');
            const educationDoc = await getDoc(doc(this.db, 'content', 'education'));
            this.cache.education = educationDoc.exists() ? educationDoc.data() : { weeklyWorkshop: {}, courses: [], fbd: { pageTitle: "", about: "", events: [] } };
            console.log(`[Data Loader] ✓ Education content loaded`);

            // Fetch about
            console.log('[Data Loader] Fetching about...');
            const aboutDoc = await getDoc(doc(this.db, 'content', 'about'));
            this.cache.about = aboutDoc.exists() ? aboutDoc.data() : { story: { paragraphs: [] }, values: [], founders: [], team: [] };
            console.log(`[Data Loader] ✓ About content loaded`);

            // Fetch home
            console.log('[Data Loader] Fetching home...');
            const homeDoc = await getDoc(doc(this.db, 'content', 'home'));
            this.cache.home = homeDoc.exists() ? homeDoc.data() : { hero: {}, mission: {} };
            console.log(`[Data Loader] ✓ Home content loaded`);

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
        console.log('[Data Loader] getEvents() called');
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
        console.log('[Data Loader] getLibrary() called');
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
     * Get magazine content
     */
    async getMagazine(forceRefresh = false) {
        console.log('[Data Loader] getMagazine() called');
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
     * Get education content
     */
    async getEducation(forceRefresh = false) {
        console.log('[Data Loader] getEducation() called');
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
        console.log('[Data Loader] getAbout() called');
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
        console.log('[Data Loader] getHome() called');
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
            console.warn('[Data Loader] formatDate called with null/undefined');
            return null;
        }
        
        const date = new Date(isoString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('[Data Loader] Invalid date string:', isoString);
            return null;
        }
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        
        const currentLang = localStorage.getItem('language') || 'en';
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
            console.warn('[Data Loader] isPastEvent called with null/undefined');
            return false;
        }
        
        const date = new Date(isoString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('[Data Loader] Invalid date string:', isoString);
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
