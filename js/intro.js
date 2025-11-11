// Intro Animation Controller
(function() {
    // Check if intro has been shown in this session
    const introShown = sessionStorage.getItem('introShown');
    const introOverlay = document.getElementById('introOverlay');
    
    if (!introOverlay) {
        return; // Exit if intro overlay doesn't exist
    }
    
    // If intro was already shown this session, hide it immediately
    if (introShown === 'true') {
        introOverlay.style.display = 'none';
        document.body.classList.remove('intro-active');
        return;
    }
    
    // Add intro-active class to hide page content
    document.body.classList.add('intro-active');
    
    // Intro animation sequence
    const INTRO_DURATION = 2800; // Total time for intro (2.8 seconds)
    const FADE_OUT_DURATION = 800; // Fade out duration (0.8 seconds)
    
    // Start fade out after intro animations complete
    setTimeout(() => {
        introOverlay.classList.add('fade-out');
        
        // Remove intro overlay and show page content after fade out
        setTimeout(() => {
            introOverlay.style.display = 'none';
            document.body.classList.remove('intro-active');
            
            // Mark intro as shown for this session
            sessionStorage.setItem('introShown', 'true');
            
            // Trigger any page load animations
            document.body.classList.add('loaded');
        }, FADE_OUT_DURATION);
    }, INTRO_DURATION);
    
    // Preload main page content
    window.addEventListener('load', () => {
        // Ensure fonts and images are loaded
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                console.log('Fonts loaded for intro animation');
            });
        }
    });
    
    // Allow skipping intro by clicking/tapping
    introOverlay.addEventListener('click', () => {
        if (!introOverlay.classList.contains('fade-out')) {
            introOverlay.classList.add('fade-out');
            
            setTimeout(() => {
                introOverlay.style.display = 'none';
                document.body.classList.remove('intro-active');
                sessionStorage.setItem('introShown', 'true');
                document.body.classList.add('loaded');
            }, FADE_OUT_DURATION);
        }
    });
    
    console.log('AIAS Basra Intro Animation Initialized');
})();
