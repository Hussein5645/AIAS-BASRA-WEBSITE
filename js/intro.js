// Intro Animation Controller
(function() {
    // Check if intro has been shown in this session
    const introShown = sessionStorage.getItem('introShown');
    const introOverlay = document.getElementById('introOverlay');
    
    if (!introOverlay) {
        return; // Exit if intro overlay doesn't exist
    }
    
    // Get reference to intro logo for double-click functionality
    const introLogo = introOverlay.querySelector('.intro-logo');
    
    // Intro animation sequence
    const INTRO_DURATION = 2800; // Total time for intro (2.8 seconds)
    const FADE_OUT_DURATION = 800; // Fade out duration (0.8 seconds)
    
    let introTimeout;
    let fadeTimeout;
    
    // Function to start the intro animation
    function playIntroAnimation() {
        // Clear any existing timeouts
        if (introTimeout) clearTimeout(introTimeout);
        if (fadeTimeout) clearTimeout(fadeTimeout);
        
        // Reset animation by removing and re-adding elements
        introOverlay.classList.remove('fade-out');
        introOverlay.style.display = 'flex';
        document.body.classList.add('intro-active');
        
        // Force reflow to restart CSS animations
        const introContent = introOverlay.querySelector('.intro-content');
        if (introContent) {
            introContent.style.animation = 'none';
            introLogo.style.animation = 'none';
            introOverlay.offsetHeight; // Trigger reflow
            introContent.style.animation = '';
            introLogo.style.animation = '';
        }
        
        // Start fade out after intro animations complete
        introTimeout = setTimeout(() => {
            introOverlay.classList.add('fade-out');
            
            // Remove intro overlay and show page content after fade out
            fadeTimeout = setTimeout(() => {
                introOverlay.style.display = 'none';
                document.body.classList.remove('intro-active');
                
                // Mark intro as shown for this session
                sessionStorage.setItem('introShown', 'true');
                
                // Trigger any page load animations
                document.body.classList.add('loaded');
            }, FADE_OUT_DURATION);
        }, INTRO_DURATION);
    }
    
    // If intro was already shown this session, hide it immediately
    if (introShown === 'true') {
        introOverlay.style.display = 'none';
        document.body.classList.remove('intro-active');
    } else {
        // Add intro-active class to hide page content
        playIntroAnimation();
    }
    
    // Preload main page content
    window.addEventListener('load', () => {
        // Ensure fonts and images are loaded
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                console.log('Fonts loaded for intro animation');
            });
        }
    });
    
    // Allow skipping intro by clicking/tapping (single click)
    let clickTimeout;
    introOverlay.addEventListener('click', (e) => {
        // Don't skip if double-clicking on logo
        if (e.target === introLogo || e.target.closest('.intro-logo')) {
            return;
        }
        
        if (!introOverlay.classList.contains('fade-out')) {
            clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => {
                introOverlay.classList.add('fade-out');
                
                setTimeout(() => {
                    introOverlay.style.display = 'none';
                    document.body.classList.remove('intro-active');
                    sessionStorage.setItem('introShown', 'true');
                    document.body.classList.add('loaded');
                }, FADE_OUT_DURATION);
            }, 200); // Small delay to allow double-click detection
        }
    });
    
    // Double-click on logo to replay animation
    if (introLogo) {
        introLogo.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            clearTimeout(clickTimeout); // Cancel any pending single-click action
            console.log('Double-click detected on AIAS logo - replaying animation');
            playIntroAnimation();
        });
    }
    
    console.log('AIAS Basra Intro Animation Initialized');
})();
