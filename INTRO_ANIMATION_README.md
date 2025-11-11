# Intro Animation Documentation

## Overview
The AIAS Basra website features a professional intro animation that displays when users first visit the homepage. The animation showcases the AIAS logo with smooth reveal effects and transitions to the main content.

## Files

### CSS
- **Location**: `css/intro.css`
- **Purpose**: Defines all intro animation styles, keyframes, and responsive layouts
- **Keyframes**:
  - `logoReveal`: Logo scale and rotate animation
  - `titleSlideUp`: Title slide-up and fade-in
  - `subtitleSlideUp`: Subtitle slide-up and fade-in
  - `introContentFadeIn`: Initial content fade-in

### JavaScript
- **Location**: `js/intro.js`
- **Purpose**: Controls intro timing, session management, and user interactions
- **Key Functions**:
  - Session check (shows intro only once per session)
  - Automatic fade-out after 2.8 seconds
  - Click/tap to skip functionality
  - Page content reveal after intro

### HTML
- **Location**: `index.html` (intro overlay section)
- **Structure**:
  ```html
  <div class="intro-overlay" id="introOverlay">
      <div class="intro-content">
          <img src="..." class="intro-logo">
          <h1 class="intro-title">AIAS Basra Chapter</h1>
          <p class="intro-subtitle">Building the Future of Architecture</p>
      </div>
  </div>
  ```

## How It Works

### 1. Initial Load
When a user visits `index.html` for the first time in a session:
1. Intro overlay appears with gradient background
2. Logo animates with scale and rotate effect (1.2s)
3. Title slides up and fades in (0.8s, 0.4s delay)
4. Subtitle slides up and fades in (0.8s, 0.7s delay)

### 2. Automatic Transition
After 2.8 seconds:
1. Intro overlay fades out (0.8s)
2. Page content becomes visible
3. `sessionStorage` marks intro as shown
4. Intro won't show again until session ends

### 3. Skip Functionality
Users can skip the intro by:
- Clicking anywhere on the intro overlay
- Tapping on mobile devices
- Intro immediately fades out when clicked

### 4. Session Management
The intro uses `sessionStorage` to track if it has been shown:
```javascript
sessionStorage.getItem('introShown') // Returns 'true' after first view
```

## Customization

### Timing
To adjust animation timing, edit `js/intro.js`:
```javascript
const INTRO_DURATION = 2800; // Total intro time (ms)
const FADE_OUT_DURATION = 800; // Fade out time (ms)
```

### Colors
To change colors, edit `css/intro.css`:
```css
background: linear-gradient(135deg, #661F22 0%, #945C50 100%);
color: var(--secondary-color); /* #F0DAA1 */
```

### Animation Speed
To adjust animation speeds, edit keyframe durations in `css/intro.css`:
```css
.intro-logo {
    animation: logoReveal 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

## Responsive Breakpoints

- **Mobile** (< 480px): Smaller logo (100px), reduced text sizes
- **Tablet** (< 768px): Medium logo (120px), adjusted spacing
- **Desktop** (≥ 768px): Full-size logo (150px), standard layout

## Browser Compatibility

The intro animation uses modern CSS and JavaScript features:
- CSS Transforms
- CSS Animations
- sessionStorage API
- ES6+ JavaScript

**Supported Browsers**:
- Chrome 50+
- Firefox 52+
- Safari 10+
- Edge 79+

## Performance

The animation is optimized for 60fps performance:
- Uses `transform` and `opacity` (GPU-accelerated properties)
- No layout reflows during animation
- Minimal JavaScript execution
- Page content hidden during intro to prevent layout shifts

## Troubleshooting

### Intro doesn't show
1. Check browser console for JavaScript errors
2. Verify `css/intro.css` and `js/intro.js` are loaded
3. Clear sessionStorage: `sessionStorage.clear()`

### Animation is choppy
1. Check for other heavy scripts running on page load
2. Verify GPU acceleration is enabled in browser
3. Test on different devices

### Intro shows every time
1. Check if sessionStorage is enabled in browser
2. Verify JavaScript is not blocked
3. Check for errors in browser console

## Maintenance

When updating the intro animation:
1. Test on multiple devices and screen sizes
2. Verify sessionStorage functionality
3. Check performance (should maintain 60fps)
4. Ensure skip functionality works
5. Test with different network speeds

## Future Enhancements

Potential improvements for future versions:
- Add loading progress indicator
- Include sound effects (optional, user-controlled)
- Add multiple intro variations
- Implement A/B testing capability
- Add analytics tracking for skip rate
