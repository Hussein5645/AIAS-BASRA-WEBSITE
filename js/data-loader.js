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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DataLoader = (function() {
    let cachedData = null;

    // Fetch data from Firestore
    async function fetchData() {
        if (cachedData) {
            return cachedData;
        }

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
            const homeDoc = await getDoc(doc(db, 'content', 'home'));
            if (homeDoc.exists()) {
                data.home = homeDoc.data();
            }

            // Fetch events
            const eventsSnapshot = await getDocs(collection(db, 'events'));
            data.events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch magazine data
            const magazineDoc = await getDoc(doc(db, 'content', 'magazine'));
            if (magazineDoc.exists()) {
                data.magazine = magazineDoc.data();
            }

            // Fetch library items
            const librarySnapshot = await getDocs(collection(db, 'library'));
            data.library = librarySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch education data
            const educationDoc = await getDoc(doc(db, 'content', 'education'));
            if (educationDoc.exists()) {
                data.education = educationDoc.data();
            }

            // Fetch about data
            const aboutDoc = await getDoc(doc(db, 'content', 'about'));
            if (aboutDoc.exists()) {
                data.about = aboutDoc.data();
            }

            cachedData = data;
            return cachedData;
        } catch (error) {
            console.error('Error loading data from Firestore:', error);
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
