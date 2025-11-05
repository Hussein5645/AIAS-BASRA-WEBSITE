// Firestore API Integration for Content Management
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

class FirestoreAPI {
    constructor() {
        this.db = db;
    }

    /**
     * Get all content data (simulates getting data.json structure)
     * @returns {Promise<object>} All content data
     */
    async getAllContent() {
        try {
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
            const homeDoc = await getDoc(doc(this.db, 'content', 'home'));
            if (homeDoc.exists()) {
                data.home = homeDoc.data();
            }

            // Fetch events
            const eventsSnapshot = await getDocs(collection(this.db, 'events'));
            data.events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch magazine data
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            if (magazineDoc.exists()) {
                data.magazine = magazineDoc.data();
            }

            // Fetch library items
            const librarySnapshot = await getDocs(collection(this.db, 'library'));
            data.library = librarySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch education data
            const educationDoc = await getDoc(doc(this.db, 'content', 'education'));
            if (educationDoc.exists()) {
                data.education = educationDoc.data();
            }

            // Fetch about data
            const aboutDoc = await getDoc(doc(this.db, 'content', 'about'));
            if (aboutDoc.exists()) {
                data.about = aboutDoc.data();
            }

            return {
                success: true,
                content: data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new event to Firestore
     * @param {object} event - Event object to add
     * @returns {Promise<object>} Result with success status
     */
    async addEvent(event) {
        try {
            const docRef = await addDoc(collection(this.db, 'events'), event);
            return {
                success: true,
                message: `Event added successfully with ID: ${docRef.id}`,
                id: docRef.id
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new magazine article to Firestore
     * @param {object} article - Article object to add
     * @returns {Promise<object>} Result with success status
     */
    async addArticle(article) {
        try {
            // Get current magazine data
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            let magazineData = magazineDoc.exists() ? magazineDoc.data() : {
                featuredArticle: null,
                articles: [],
                releases: []
            };

            // Add new article
            if (!magazineData.articles) {
                magazineData.articles = [];
            }
            magazineData.articles.push(article);

            // Update magazine document
            await setDoc(doc(this.db, 'content', 'magazine'), magazineData);

            return {
                success: true,
                message: 'Article added successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new library resource to Firestore
     * @param {object} resource - Library resource object to add
     * @returns {Promise<object>} Result with success status
     */
    async addLibraryResource(resource) {
        try {
            const docRef = await addDoc(collection(this.db, 'library'), resource);
            return {
                success: true,
                message: `Library resource added successfully with ID: ${docRef.id}`,
                id: docRef.id
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update education content in Firestore
     * @param {object} education - Education content object
     * @returns {Promise<object>} Result with success status
     */
    async updateEducation(education) {
        try {
            // Get current education data
            const educationDoc = await getDoc(doc(this.db, 'content', 'education'));
            let educationData = educationDoc.exists() ? educationDoc.data() : {
                weeklyWorkshop: {},
                courses: [],
                fbd: {
                    pageTitle: "",
                    about: "",
                    events: []
                }
            };

            // Update weekly workshop
            educationData.weeklyWorkshop = education;

            // Update education document
            await setDoc(doc(this.db, 'content', 'education'), educationData);

            return {
                success: true,
                message: 'Education content updated successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update entire content document (simulates updating data.json)
     * @param {object} content - Complete content object
     * @returns {Promise<object>} Result with success status
     */
    async updateAllContent(content) {
        try {
            // Update home data
            if (content.home) {
                await setDoc(doc(this.db, 'content', 'home'), content.home);
            }

            // Update magazine data
            if (content.magazine) {
                await setDoc(doc(this.db, 'content', 'magazine'), content.magazine);
            }

            // Update education data
            if (content.education) {
                await setDoc(doc(this.db, 'content', 'education'), content.education);
            }

            // Update about data
            if (content.about) {
                await setDoc(doc(this.db, 'content', 'about'), content.about);
            }

            return {
                success: true,
                message: 'All content updated successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if user has permission (always returns true for authenticated users)
     * This replaces the GitHub token check
     * @returns {boolean}
     */
    hasToken() {
        // Always return true since Firestore security rules handle permissions
        return true;
    }

    /**
     * Get file content (compatibility method for admin dashboard)
     * @returns {Promise<object>}
     */
    async getFileContent() {
        return this.getAllContent();
    }

    /**
     * Update data (compatibility method for admin dashboard)
     * @param {object} newData - New data to save
     * @returns {Promise<object>}
     */
    async updateDataJson(newData) {
        return this.updateAllContent(newData);
    }

    /**
     * No-op methods for compatibility (token management not needed with Firestore)
     */
    setToken(token) {
        // No-op: Firestore uses Firebase Auth, not tokens
    }

    getToken() {
        return '';
    }
}

// Export for use in other scripts
window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;
