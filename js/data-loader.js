// Data loader for AIAS Basra Website
// This module handles loading and caching data from Firebase Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Initialize Firebase
console.log('[Data Loader] Initializing Firebase app...');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
console.log('[Data Loader] Firebase initialized successfully');
console.log('[Data Loader] Firestore instance created');

const DataLoader = (function() {
    let cachedData = null;

    // Fetch data from Firestore
    async function fetchData() {
        console.log('[Data Loader] fetchData() called');
        
        if (cachedData) {
            console.log('[Data Loader] Returning cached data');
            return cachedData;
        }

        console.log('[Data Loader] Fetching fresh data from Firestore...');
        try {
            // Fetch all collections from Firestore
            const data = {
                home: {},
                events: [],
                magazine: {
                    featuredArticle: null,
                    articles: [],
                    releases: []
                },
                library: [],
                education: {
                    weeklyWorkshop: {},
                    courses: [],
                    fbd: {
                        pageTitle: "",
                        about: "",
                        events: []
                    }
                },
                about: {
                    story: { paragraphs: [] },
                    values: [],
                    founders: [],
                    team: []
                }
            };

            // Fetch home data
            console.log('[Data Loader] Fetching home content...');
            const homeDoc = await getDoc(doc(db, 'content', 'home'));
            if (homeDoc.exists()) {
                data.home = homeDoc.data();
                console.log('[Data Loader] ✓ Home content loaded');
            } else {
                console.log('[Data Loader] ⚠ No home content found in Firestore');
            }

            // Fetch events
            console.log('[Data Loader] Fetching events...');
            const eventsSnapshot = await getDocs(collection(db, 'events'));
            data.events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[Data Loader] ✓ Loaded ${data.events.length} events`);

            // Fetch magazine data
            console.log('[Data Loader] Fetching magazine content...');
            const magazineDoc = await getDoc(doc(db, 'content', 'magazine'));
            if (magazineDoc.exists()) {
                data.magazine = magazineDoc.data();
                console.log('[Data Loader] ✓ Magazine content loaded');
            } else {
                console.log('[Data Loader] ⚠ No magazine content found in Firestore');
            }

            // Fetch library items
            console.log('[Data Loader] Fetching library items...');
            const librarySnapshot = await getDocs(collection(db, 'library'));
            data.library = librarySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[Data Loader] ✓ Loaded ${data.library.length} library items`);

            // Fetch education data
            console.log('[Data Loader] Fetching education content...');
            const educationDoc = await getDoc(doc(db, 'content', 'education'));
            if (educationDoc.exists()) {
                data.education = educationDoc.data();
                console.log('[Data Loader] ✓ Education content loaded');
            } else {
                console.log('[Data Loader] ⚠ No education content found in Firestore');
            }

            // Fetch about data
            console.log('[Data Loader] Fetching about content...');
            const aboutDoc = await getDoc(doc(db, 'content', 'about'));
            if (aboutDoc.exists()) {
                data.about = aboutDoc.data();
                console.log('[Data Loader] ✓ About content loaded');
            } else {
                console.log('[Data Loader] ⚠ No about content found in Firestore');
            }

            cachedData = data;
            console.log('[Data Loader] ✓ All data loaded and cached successfully');
            return cachedData;
        } catch (error) {
            console.error('[Data Loader] ✗ Error loading data from Firestore:', error);
            console.error('[Data Loader] Error details:', {
                code: error.code,
                message: error.message,
                name: error.name
            });
            return null;
        }
    }

    // Format date string
    function formatDate(isoString) {
        const date = new Date(isoString);
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

    // Check if event is past
    function isPastEvent(isoString) {
        return new Date(isoString) < new Date();
    }

    // Get events
    async function getEvents() {
        const data = await fetchData();
        return data ? data.events : [];
    }

    // Get magazine data
    async function getMagazine() {
        const data = await fetchData();
        return data ? data.magazine : { articles: [], releases: [] };
    }

    // Get library items
    async function getLibrary() {
        const data = await fetchData();
        return data ? data.library : [];
    }

    // Get education data
    async function getEducation() {
        const data = await fetchData();
        return data ? data.education : null;
    }

    // Get about/founders data
    async function getAbout() {
        const data = await fetchData();
        return data ? data.about : { founders: [] };
    }

    // Get home page data
    async function getHome() {
        const data = await fetchData();
        return data ? data.home : null;
    }

    // Public API
    return {
        fetchData,
        formatDate,
        isPastEvent,
        getEvents,
        getMagazine,
        getLibrary,
        getEducation,
        getAbout,
        getHome
    };
})();

// Export for use in other modules
window.DataLoader = DataLoader;
