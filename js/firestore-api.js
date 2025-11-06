// Firestore API Integration for Content Management
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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

// Initialize Firebase (with error handling for multiple initializations)
console.log('[Firestore API] Initializing Firebase app...');
let app;
try {
    app = getApp();
    console.log('[Firestore API] Using existing Firebase app');
} catch (error) {
    app = initializeApp(firebaseConfig);
    console.log('[Firestore API] Created new Firebase app');
}
const db = getFirestore(app);
console.log('[Firestore API] Firebase initialized successfully');
console.log('[Firestore API] Firestore instance created');

class FirestoreAPI {
    constructor() {
        this.db = db;
        console.log('[Firestore API] FirestoreAPI instance created');
    }

    /**
     * Get all content data (simulates getting data.json structure)
     * @returns {Promise<object>} All content data
     */
    async getAllContent() {
        console.log('[Firestore API] getAllContent() called');
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
            console.log('[Firestore API] Reading home content...');
            const homeDoc = await getDoc(doc(this.db, 'content', 'home'));
            if (homeDoc.exists()) {
                data.home = homeDoc.data();
                console.log('[Firestore API] ✓ Home content retrieved');
            }

            // Fetch events
            console.log('[Firestore API] Reading events collection...');
            const eventsSnapshot = await getDocs(collection(this.db, 'events'));
            data.events = eventsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Firestore API] ✓ Retrieved ${data.events.length} events`);

            // Fetch magazine data
            console.log('[Firestore API] Reading magazine content...');
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            if (magazineDoc.exists()) {
                data.magazine = magazineDoc.data();
                console.log('[Firestore API] ✓ Magazine content retrieved');
            }

            // Fetch library items
            console.log('[Firestore API] Reading library collection...');
            const librarySnapshot = await getDocs(collection(this.db, 'library'));
            data.library = librarySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`[Firestore API] ✓ Retrieved ${data.library.length} library items`);

            // Fetch education data
            console.log('[Firestore API] Reading education content...');
            const educationDoc = await getDoc(doc(this.db, 'content', 'education'));
            if (educationDoc.exists()) {
                data.education = educationDoc.data();
                console.log('[Firestore API] ✓ Education content retrieved');
            }

            // Fetch about data
            console.log('[Firestore API] Reading about content...');
            const aboutDoc = await getDoc(doc(this.db, 'content', 'about'));
            if (aboutDoc.exists()) {
                data.about = aboutDoc.data();
                console.log('[Firestore API] ✓ About content retrieved');
            }

            console.log('[Firestore API] ✓ All content retrieved successfully');
            return {
                success: true,
                content: data
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error in getAllContent:', error);
            console.error('[Firestore API] Error details:', {
                code: error.code,
                message: error.message,
                name: error.name
            });
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
        console.log('[Firestore API] addEvent() called with:', event);
        try {
            const docRef = await addDoc(collection(this.db, 'events'), event);
            console.log(`[Firestore API] ✓ Event added successfully with ID: ${docRef.id}`);
            return {
                success: true,
                message: `Event added successfully with ID: ${docRef.id}`,
                id: docRef.id
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error adding event:', error);
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
        console.log('[Firestore API] addArticle() called with:', article);
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
            console.log('[Firestore API] ✓ Article added successfully');

            return {
                success: true,
                message: 'Article added successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error adding article:', error);
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
        console.log('[Firestore API] addLibraryResource() called with:', resource);
        try {
            const docRef = await addDoc(collection(this.db, 'library'), resource);
            console.log(`[Firestore API] ✓ Library resource added with ID: ${docRef.id}`);
            return {
                success: true,
                message: `Library resource added successfully with ID: ${docRef.id}`,
                id: docRef.id
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error adding library resource:', error);
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
        console.log('[Firestore API] updateEducation() called with:', education);
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
            console.log('[Firestore API] ✓ Education content updated successfully');

            return {
                success: true,
                message: 'Education content updated successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error updating education:', error);
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
        console.log('[Firestore API] updateAllContent() called');
        try {
            // Update home data
            if (content.home) {
                console.log('[Firestore API] Writing home content...');
                await setDoc(doc(this.db, 'content', 'home'), content.home);
                console.log('[Firestore API] ✓ Home content written');
            }

            // Update magazine data
            if (content.magazine) {
                console.log('[Firestore API] Writing magazine content...');
                await setDoc(doc(this.db, 'content', 'magazine'), content.magazine);
                console.log('[Firestore API] ✓ Magazine content written');
            }

            // Update education data
            if (content.education) {
                console.log('[Firestore API] Writing education content...');
                await setDoc(doc(this.db, 'content', 'education'), content.education);
                console.log('[Firestore API] ✓ Education content written');
            }

            // Update about data
            if (content.about) {
                console.log('[Firestore API] Writing about content...');
                await setDoc(doc(this.db, 'content', 'about'), content.about);
                console.log('[Firestore API] ✓ About content written');
            }

            console.log('[Firestore API] ✓ All content updated successfully');
            return {
                success: true,
                message: 'All content updated successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error updating content:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete event from Firestore
     * @param {string} eventId - Event ID to delete
     * @returns {Promise<object>} Result with success status
     */
    async deleteEvent(eventId) {
        console.log(`[Firestore API] deleteEvent() called for ID: ${eventId}`);
        try {
            await deleteDoc(doc(this.db, 'events', eventId));
            console.log(`[Firestore API] ✓ Event ${eventId} deleted successfully`);
            return {
                success: true,
                message: 'Event deleted successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error deleting event:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update event in Firestore
     * @param {string} eventId - Event ID to update
     * @param {object} event - Updated event object
     * @returns {Promise<object>} Result with success status
     */
    async updateEvent(eventId, event) {
        console.log(`[Firestore API] updateEvent() called for ID: ${eventId}`);
        try {
            await updateDoc(doc(this.db, 'events', eventId), event);
            console.log(`[Firestore API] ✓ Event ${eventId} updated successfully`);
            return {
                success: true,
                message: 'Event updated successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error updating event:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete library resource from Firestore
     * @param {string} resourceId - Resource ID to delete
     * @returns {Promise<object>} Result with success status
     */
    async deleteLibraryResource(resourceId) {
        console.log(`[Firestore API] deleteLibraryResource() called for ID: ${resourceId}`);
        try {
            await deleteDoc(doc(this.db, 'library', resourceId));
            console.log(`[Firestore API] ✓ Library resource ${resourceId} deleted successfully`);
            return {
                success: true,
                message: 'Library resource deleted successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error deleting library resource:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update library resource in Firestore
     * @param {string} resourceId - Resource ID to update
     * @param {object} resource - Updated resource object
     * @returns {Promise<object>} Result with success status
     */
    async updateLibraryResource(resourceId, resource) {
        console.log(`[Firestore API] updateLibraryResource() called for ID: ${resourceId}`);
        try {
            await updateDoc(doc(this.db, 'library', resourceId), resource);
            console.log(`[Firestore API] ✓ Library resource ${resourceId} updated successfully`);
            return {
                success: true,
                message: 'Library resource updated successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error updating library resource:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete article from magazine in Firestore
     * @param {string} articleId - Article ID to delete
     * @returns {Promise<object>} Result with success status
     */
    async deleteArticle(articleId) {
        console.log(`[Firestore API] deleteArticle() called for ID: ${articleId}`);
        try {
            // Get current magazine data
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            if (!magazineDoc.exists()) {
                return {
                    success: false,
                    error: 'Magazine content not found'
                };
            }

            let magazineData = magazineDoc.data();
            if (!magazineData.articles) {
                return {
                    success: false,
                    error: 'No articles found'
                };
            }

            // Remove article
            magazineData.articles = magazineData.articles.filter(article => article.id !== articleId);

            // Update magazine document
            await setDoc(doc(this.db, 'content', 'magazine'), magazineData);
            console.log(`[Firestore API] ✓ Article ${articleId} deleted successfully`);

            return {
                success: true,
                message: 'Article deleted successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error deleting article:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update article in magazine in Firestore
     * @param {string} articleId - Article ID to update
     * @param {object} updatedArticle - Updated article object
     * @returns {Promise<object>} Result with success status
     */
    async updateArticle(articleId, updatedArticle) {
        console.log(`[Firestore API] updateArticle() called for ID: ${articleId}`);
        try {
            // Get current magazine data
            const magazineDoc = await getDoc(doc(this.db, 'content', 'magazine'));
            if (!magazineDoc.exists()) {
                return {
                    success: false,
                    error: 'Magazine content not found'
                };
            }

            let magazineData = magazineDoc.data();
            if (!magazineData.articles) {
                return {
                    success: false,
                    error: 'No articles found'
                };
            }

            // Update article
            const articleIndex = magazineData.articles.findIndex(article => article.id === articleId);
            if (articleIndex === -1) {
                return {
                    success: false,
                    error: 'Article not found'
                };
            }

            magazineData.articles[articleIndex] = { ...magazineData.articles[articleIndex], ...updatedArticle };

            // Update magazine document
            await setDoc(doc(this.db, 'content', 'magazine'), magazineData);
            console.log(`[Firestore API] ✓ Article ${articleId} updated successfully`);

            return {
                success: true,
                message: 'Article updated successfully'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error updating article:', error);
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

    /**
     * Test Firestore connection
     * @returns {Promise<object>} Result with success status
     */
    async testConnection() {
        console.log('[Firestore API] testConnection() called');
        try {
            // Try to read config/admins to test connection
            const adminDoc = await getDoc(doc(this.db, 'config', 'admins'));
            console.log('[Firestore API] ✓ Connection test successful');
            return {
                success: true,
                message: 'Connection successful'
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Connection test failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get the expected Firestore structure template
     * @returns {object} Expected structure
     */
    getExpectedStructure() {
        return {
            content: {
                home: {},
                magazine: {
                    featuredArticle: null,
                    articles: [],
                    releases: []
                },
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
            },
            config: {
                admins: {
                    admins: []
                }
            },
            collections: ['events', 'library']
        };
    }

    /**
     * Validate and fix Firestore structure
     * @returns {Promise<object>} Result with success status and details
     */
    async validateAndFixStructure() {
        console.log('[Firestore API] validateAndFixStructure() called');
        const results = {
            success: true,
            actions: [],
            errors: []
        };

        try {
            const expected = this.getExpectedStructure();

            // Check and fix content documents
            for (const [docName, docStructure] of Object.entries(expected.content)) {
                try {
                    const docRef = doc(this.db, 'content', docName);
                    const docSnap = await getDoc(docRef);
                    
                    if (!docSnap.exists()) {
                        // Document missing - create it
                        await setDoc(docRef, docStructure);
                        results.actions.push(`Created missing document: content/${docName}`);
                        console.log(`[Firestore API] ✓ Created content/${docName}`);
                    } else {
                        // Document exists - validate structure
                        const currentData = docSnap.data();
                        let needsUpdate = false;
                        const updatedData = { ...currentData };

                        // Add missing fields
                        for (const [key, value] of Object.entries(docStructure)) {
                            if (!(key in updatedData)) {
                                updatedData[key] = value;
                                needsUpdate = true;
                                results.actions.push(`Added missing field: content/${docName}.${key}`);
                            }
                        }

                        if (needsUpdate) {
                            await setDoc(docRef, updatedData);
                            console.log(`[Firestore API] ✓ Updated content/${docName} with missing fields`);
                        } else {
                            results.actions.push(`Validated: content/${docName} is correct`);
                        }
                    }
                } catch (error) {
                    results.errors.push(`Error with content/${docName}: ${error.message}`);
                    console.error(`[Firestore API] ✗ Error with content/${docName}:`, error);
                }
            }

            // Check and fix config documents
            for (const [docName, docStructure] of Object.entries(expected.config)) {
                try {
                    const docRef = doc(this.db, 'config', docName);
                    const docSnap = await getDoc(docRef);
                    
                    if (!docSnap.exists()) {
                        // Document missing - create it
                        await setDoc(docRef, docStructure);
                        results.actions.push(`Created missing document: config/${docName}`);
                        console.log(`[Firestore API] ✓ Created config/${docName}`);
                    } else {
                        results.actions.push(`Validated: config/${docName} exists`);
                    }
                } catch (error) {
                    results.errors.push(`Error with config/${docName}: ${error.message}`);
                    console.error(`[Firestore API] ✗ Error with config/${docName}:`, error);
                }
            }

            // Check collections exist (events and library)
            // Note: We use a simple read to check existence without fetching all documents
            for (const collectionName of expected.collections) {
                try {
                    const collectionRef = collection(this.db, collectionName);
                    const snapshot = await getDocs(collectionRef);
                    results.actions.push(`Validated: ${collectionName} collection exists (${snapshot.size} documents)`);
                } catch (error) {
                    results.errors.push(`Error checking ${collectionName} collection: ${error.message}`);
                    console.error(`[Firestore API] ✗ Error with ${collectionName}:`, error);
                }
            }

            if (results.errors.length > 0) {
                results.success = false;
            }

            console.log('[Firestore API] ✓ Structure validation completed');
            return results;

        } catch (error) {
            console.error('[Firestore API] ✗ Error in validateAndFixStructure:', error);
            return {
                success: false,
                actions: results.actions,
                errors: [...results.errors, error.message]
            };
        }
    }

    /**
     * Get list of admin emails
     * @returns {Promise<object>} Result with admin list
     */
    async getAdmins() {
        console.log('[Firestore API] getAdmins() called');
        try {
            const adminDoc = await getDoc(doc(this.db, 'config', 'admins'));
            if (adminDoc.exists()) {
                const data = adminDoc.data();
                console.log('[Firestore API] ✓ Admins retrieved');
                return {
                    success: true,
                    admins: data.admins || []
                };
            } else {
                console.log('[Firestore API] No admin document found, creating...');
                await setDoc(doc(this.db, 'config', 'admins'), { admins: [] });
                return {
                    success: true,
                    admins: []
                };
            }
        } catch (error) {
            console.error('[Firestore API] ✗ Error getting admins:', error);
            return {
                success: false,
                error: error.message,
                admins: []
            };
        }
    }

    /**
     * Add admin email to the list
     * @param {string} email - Email to add
     * @returns {Promise<object>} Result with success status
     */
    async addAdmin(email) {
        console.log(`[Firestore API] addAdmin() called with email: ${email}`);
        try {
            const emailLower = email.toLowerCase().trim();
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailLower)) {
                return {
                    success: false,
                    error: 'Invalid email format'
                };
            }

            const adminDoc = await getDoc(doc(this.db, 'config', 'admins'));
            let admins = [];
            
            if (adminDoc.exists()) {
                admins = adminDoc.data().admins || [];
            }

            // Check if email already exists
            if (admins.includes(emailLower)) {
                return {
                    success: false,
                    error: 'Email already exists in admin list'
                };
            }

            // Add new admin
            admins.push(emailLower);
            await setDoc(doc(this.db, 'config', 'admins'), { admins });
            
            console.log(`[Firestore API] ✓ Admin ${emailLower} added successfully`);
            return {
                success: true,
                message: `Admin ${emailLower} added successfully`,
                admins
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error adding admin:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Remove admin email from the list
     * @param {string} email - Email to remove
     * @returns {Promise<object>} Result with success status
     */
    async removeAdmin(email) {
        console.log(`[Firestore API] removeAdmin() called with email: ${email}`);
        try {
            const emailLower = email.toLowerCase().trim();
            const adminDoc = await getDoc(doc(this.db, 'config', 'admins'));
            
            if (!adminDoc.exists()) {
                return {
                    success: false,
                    error: 'Admin list not found'
                };
            }

            let admins = adminDoc.data().admins || [];
            
            // Check if email exists
            if (!admins.includes(emailLower)) {
                return {
                    success: false,
                    error: 'Email not found in admin list'
                };
            }

            // Remove admin
            admins = admins.filter(a => a !== emailLower);
            await setDoc(doc(this.db, 'config', 'admins'), { admins });
            
            console.log(`[Firestore API] ✓ Admin ${emailLower} removed successfully`);
            return {
                success: true,
                message: `Admin ${emailLower} removed successfully`,
                admins
            };
        } catch (error) {
            console.error('[Firestore API] ✗ Error removing admin:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export for use in other scripts
window.FirestoreAPI = FirestoreAPI;
export default FirestoreAPI;
