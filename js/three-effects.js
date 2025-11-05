// Custom 3D-like Effects for AIAS Basra Website (CSS/Canvas based)

// Check if we're on a page with a hero section
const heroSection = document.querySelector('.hero');
if (heroSection) {
    initCustomEffects();
}

function initCustomEffects() {
    const heroBackground = document.querySelector('.hero-background');
    if (!heroBackground) return;
    
    // Create canvas for particle effects
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    heroBackground.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    let mouseX = 0, mouseY = 0;
    
    // Logo colors
    const colors = [
        '#661F22', // Primary red
        '#F0DAA1', // Secondary gold
        '#945C50', // Accent brown
        '#C09775', // Accent light
        '#CBAE9A'  // Accent lighter
    ];
    
    // Resize canvas
    function resizeCanvas() {
        width = canvas.offsetWidth;
        height = canvas.offsetHeight;
        canvas.width = width;
        canvas.height = height;
    }
    
    // Particle class
    class Particle {
        constructor() {
            this.reset();
            this.y = Math.random() * height;
        }
        
        reset() {
            this.x = Math.random() * width;
            this.y = -10;
            this.size = Math.random() * 3 + 1;
            this.speedY = Math.random() * 1 + 0.5;
            this.speedX = Math.random() * 0.5 - 0.25;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.opacity = Math.random() * 0.5 + 0.3;
        }
        
        update() {
            this.y += this.speedY;
            this.x += this.speedX;
            
            // Mouse interaction
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 100) {
                this.x -= dx * 0.01;
                this.y -= dy * 0.01;
            }
            
            if (this.y > height) {
                this.reset();
            }
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
    
    // Create 3D-like geometric shapes using CSS
    function createGeometricShapes() {
        const shapeTypes = ['cube', 'pyramid', 'octagon'];
        
        for (let i = 0; i < 5; i++) {
            const shape = document.createElement('div');
            shape.className = 'geometric-shape';
            shape.style.position = 'absolute';
            shape.style.width = `${Math.random() * 100 + 50}px`;
            shape.style.height = `${Math.random() * 100 + 50}px`;
            shape.style.left = `${Math.random() * 100}%`;
            shape.style.top = `${Math.random() * 100}%`;
            shape.style.background = colors[i % colors.length];
            shape.style.opacity = '0.1';
            shape.style.borderRadius = Math.random() > 0.5 ? '50%' : '10px';
            shape.style.transform = `rotate(${Math.random() * 360}deg)`;
            shape.style.animation = `float ${10 + i * 3}s ease-in-out infinite, rotate3d ${15 + i * 2}s linear infinite`;
            shape.style.transformStyle = 'preserve-3d';
            heroBackground.appendChild(shape);
        }
    }
    
    // Initialize
    resizeCanvas();
    createGeometricShapes();
    
    // Create particles
    for (let i = 0; i < 100; i++) {
        particles.push(new Particle());
    }
    
    // Mouse tracking
    document.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });
    
    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        // Update and draw particles
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        
        // Draw connecting lines
        particles.forEach((p1, i) => {
            particles.slice(i + 1).forEach(p2 => {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = colors[0];
                    ctx.globalAlpha = (1 - distance / 100) * 0.2;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            });
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
    
    // Handle resize
    window.addEventListener('resize', resizeCanvas);
}

// Add CSS animations for geometric shapes
const style = document.createElement('style');
style.textContent = `
    @keyframes rotate3d {
        0% {
            transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);
        }
        100% {
            transform: rotateX(360deg) rotateY(360deg) rotateZ(360deg);
        }
    }
    
    .geometric-shape {
        will-change: transform;
    }
`;
document.head.appendChild(style);
