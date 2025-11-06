// Main JavaScript for AIAS Basra Website

// Navigation Scroll Effect
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (navbar) {
        if (currentScroll > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
    
    lastScroll = currentScroll;
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Close menu when clicking on a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menuToggle.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });
}

// Scroll Reveal Animation using IntersectionObserver
// This approach works with both static and dynamically inserted .reveal elements
const revealObserverOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -150px 0px'
};

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            // Keep observing in case element is reused or animation is reset
        }
    });
}, revealObserverOptions);

// Function to observe a single element
const observeRevealElement = (element) => {
    if (element.classList.contains('reveal') && !element.classList.contains('active')) {
        revealObserver.observe(element);
        
        // Immediately check if element is already in viewport (for dynamically added elements)
        const rect = element.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
        if (isInViewport) {
            // Element is already visible, activate it immediately
            element.classList.add('active');
        }
    }
};

// Observe all existing .reveal elements
document.querySelectorAll('.reveal').forEach(observeRevealElement);

// MutationObserver to detect dynamically added .reveal elements
const revealMutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            // Check if the added node is an element
            if (node.nodeType === 1) {
                // If the node itself has .reveal class
                if (node.classList && node.classList.contains('reveal')) {
                    observeRevealElement(node);
                }
                // Check descendants for .reveal class
                if (node.querySelectorAll) {
                    node.querySelectorAll('.reveal').forEach(observeRevealElement);
                }
            }
        });
    });
});

// Start observing the document body for changes
revealMutationObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Smooth Scrolling for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href !== '') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// Parallax Effect for Hero Section
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const parallaxElements = document.querySelectorAll('.parallax');
    
    parallaxElements.forEach(element => {
        const speed = element.dataset.speed || 0.5;
        element.style.transform = `translateY(${scrolled * speed}px)`;
    });
});

// Add hover effect to cards
const cards = document.querySelectorAll('.mission-card, .link-card, .event-card, .resource-card, .article-card, .program-card, .team-card');

cards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// Active Navigation Link
const sections = document.querySelectorAll('section[id]');

if (navLinks) {
    window.addEventListener('scroll', () => {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.querySelectorAll('a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(current)) {
                link.classList.add('active');
            }
        });
    });
}

// Loading Animation
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});

// Form Validation (for contact forms if added, but exclude admin dashboard forms)
const forms = document.querySelectorAll('form');

forms.forEach(form => {
    // Skip admin dashboard forms that have novalidate attribute or are within admin context
    if (form.hasAttribute('novalidate') || form.closest('.dashboard')) {
        return;
    }
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Basic validation
        const inputs = this.querySelectorAll('input[required], textarea[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }
        });
        
        if (isValid) {
            // Submit form or show success message
            console.log('Form submitted successfully');
            this.reset();
        }
    });
});

// Intersection Observer for Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe elements with animation classes
document.querySelectorAll('.fade-in-up, .fade-in-down, .fade-in-left, .fade-in-right, .scale-in').forEach(el => {
    observer.observe(el);
});

// Counter Animation for Statistics
const animateCounter = (element, target, duration = 2000) => {
    let start = 0;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(start);
        }
    }, 16);
};

// Initialize counters when visible
const counters = document.querySelectorAll('.counter');
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const target = parseInt(entry.target.dataset.target);
            animateCounter(entry.target, target);
            counterObserver.unobserve(entry.target);
        }
    });
});

counters.forEach(counter => counterObserver.observe(counter));

// Add stagger animation to grids
const grids = document.querySelectorAll('.mission-grid, .links-grid, .events-grid, .resources-grid, .articles-grid');

grids.forEach(grid => {
    const items = grid.children;
    Array.from(items).forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
        item.classList.add('fade-in-up');
    });
});

// Language Toggle Functionality
let currentLanguage = localStorage.getItem('language') || 'en';

function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    // Update HTML lang attribute
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
    
    // Update body direction for RTL
    document.body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    
    // Update language toggle button
    const langButton = document.getElementById('currentLang');
    if (langButton) {
        langButton.textContent = lang === 'ar' ? 'AR' : 'EN';
    }
    
    // Update all elements with translations
    const elements = document.querySelectorAll('[data-en][data-ar]');
    elements.forEach(element => {
        const translation = lang === 'ar' ? element.getAttribute('data-ar') : element.getAttribute('data-en');
        if (translation) {
            element.textContent = translation;
        }
    });
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLanguage);
});

// Language toggle button event
const languageToggle = document.getElementById('languageToggle');
if (languageToggle) {
    languageToggle.addEventListener('click', () => {
        const newLang = currentLanguage === 'en' ? 'ar' : 'en';
        setLanguage(newLang);
    });
}

// Check authentication status and update navigation
function updateNavigation() {
    const isAuthenticated = localStorage.getItem('aias_authenticated') === 'true';
    const isAdmin = localStorage.getItem('aias_is_admin') === 'true';
    const userName = localStorage.getItem('aias_user_name');
    
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const userProfile = document.getElementById('userProfile');
    const userNameElement = document.getElementById('userName');
    const dashboardBtn = document.getElementById('dashboardBtn');
    
    if (isAuthenticated && userName) {
        // User is logged in - hide login/signup, show user profile
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'flex';
        if (userNameElement) userNameElement.textContent = userName;
        
        // Show dashboard button if user is admin
        if (dashboardBtn) {
            dashboardBtn.style.display = isAdmin ? 'block' : 'none';
        }
    } else {
        // User is not logged in - show login/signup, hide user profile
        if (loginBtn) loginBtn.style.display = 'block';
        if (signupBtn) signupBtn.style.display = 'block';
        if (userProfile) userProfile.style.display = 'none';
        if (dashboardBtn) dashboardBtn.style.display = 'none';
    }
}

// Handle logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Clear authentication data
        localStorage.removeItem('aias_authenticated');
        localStorage.removeItem('aias_user_email');
        localStorage.removeItem('aias_user_name');
        localStorage.removeItem('aias_user_picture');
        localStorage.removeItem('aias_is_admin');
        
        // Redirect to home page
        window.location.href = 'index.html';
    });
}

// Update navigation on page load
document.addEventListener('DOMContentLoaded', () => {
    updateNavigation();
});

console.log('AIAS Basra Website Loaded Successfully');
