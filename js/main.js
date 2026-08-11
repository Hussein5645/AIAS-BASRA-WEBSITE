// Main JavaScript for AIAS Basra Website

(() => {
    const mobileStylesHref = 'css/mobile-optimized.css';
    if (!document.querySelector(`link[href="${mobileStylesHref}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = mobileStylesHref;
        document.head.appendChild(link);
    }
})();

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
        document.body.classList.toggle('menu-open');
    });

    // Close menu when clicking on a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menuToggle.classList.remove('active');
            navLinks.classList.remove('active');
            document.body.classList.remove('menu-open');
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
        // Use same logic as IntersectionObserver (150px margin from bottom)
        const rect = element.getBoundingClientRect();
        const isInViewport = rect.top < (window.innerHeight - 150) && rect.bottom > 0;
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
            // Check if the added node is an element (nodeType 1)
            if (node.nodeType === 1) {
                // If the node itself has .reveal class
                if (node.classList.contains('reveal')) {
                    observeRevealElement(node);
                }
                // Check descendants for .reveal class
                node.querySelectorAll('.reveal').forEach(observeRevealElement);
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

function applyElementTranslation(element, lang) {
    const translation = element.getAttribute(`data-${lang}`);
    const ariaTranslation = element.getAttribute(`data-aria-${lang}`);
    if (ariaTranslation) element.setAttribute('aria-label', ariaTranslation);
    if (!translation) return;

    // Inputs and textareas need their placeholder translated; setting
    // textContent on them has no visible effect.
    if (element.matches('input, textarea')) {
        element.placeholder = translation;
        return;
    }

    // Keep child icons, counters, and controls intact when only a label is
    // being translated. Use data-i18n-text when the element contains markup.
    if (element.dataset.i18nText === 'true' || element.children.length === 0) {
        element.textContent = translation;
    } else {
        const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (textNode) textNode.textContent = translation;
        else element.setAttribute('aria-label', translation);
    }
}

function applyTranslations(root = document) {
    const scope = root instanceof Element || root instanceof Document
        ? root
        : document;
    const selector = '[data-en][data-ar], [data-aria-en][data-aria-ar]';
    const elements = scope.matches?.(selector)
        ? [scope, ...scope.querySelectorAll(selector)]
        : scope.querySelectorAll(selector);
    elements.forEach(element => applyElementTranslation(element, currentLanguage));
}

function setLanguage(lang) {
    currentLanguage = lang === 'ar' ? 'ar' : 'en';
    localStorage.setItem('language', currentLanguage);

    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    document.body.setAttribute('dir', currentLanguage === 'ar' ? 'rtl' : 'ltr');

    const langButton = document.getElementById('currentLang');
    if (langButton) langButton.textContent = currentLanguage === 'ar' ? 'EN' : 'AR';

    applyTranslations();
    window.dispatchEvent(new CustomEvent('aias-language-changed', { detail: { language: currentLanguage } }));
}

window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLanguage);
    bindLanguageToggle();

    // Translate cards and controls added later by Firestore renderers.
    if (document.body && !window.__aiasTranslationObserver) {
        window.__aiasTranslationObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) applyTranslations(node);
                });
            });
        });
        window.__aiasTranslationObserver.observe(document.body, { childList: true, subtree: true });
    }
});

function bindLanguageToggle() {
    const languageToggle = document.getElementById('languageToggle');
    if (!languageToggle || languageToggle.dataset.langBound === 'true') {
        return;
    }

    languageToggle.dataset.langBound = 'true';
    languageToggle.addEventListener('click', () => {
        const newLang = currentLanguage === 'en' ? 'ar' : 'en';
        setLanguage(newLang);
    });
}

window.addEventListener('aias-site-shell-ready', () => {
    setLanguage(currentLanguage);
    bindLanguageToggle();
});

console.log('AIAS Basra Website Loaded Successfully');
