// Data loader for AIAS Basra Website
// This module handles loading and caching data from data.json

const DataLoader = (function() {
    let cachedData = null;
    const DATA_URL = 'data/data.json';

    // Fetch data from JSON file
    async function fetchData() {
        if (cachedData) {
            return cachedData;
        }

        try {
            const response = await fetch(DATA_URL);
            if (!response.ok) {
                throw new Error('Failed to load data');
            }
            cachedData = await response.json();
            return cachedData;
        } catch (error) {
            console.error('Error loading data:', error);
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
