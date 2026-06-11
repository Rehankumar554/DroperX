// --- Smart Sticky Navbar (Desktop Only) ---
document.addEventListener("DOMContentLoaded", () => {
    let lastScrollY = window.scrollY;
    let scrollUpDistance = 0;
    let scrollDownDistance = 0;
    const topNavbar = document.querySelector('.navbar');

    if (topNavbar) {
      window.addEventListener('scroll', () => {
        // Only apply on Desktop viewports (where bottom app bar is not used)
        if (window.innerWidth <= 768) {
          topNavbar.classList.remove('nav-sticky', 'nav-show');
          document.body.style.paddingTop = '0';
          return;
        }
        
        const delta = window.scrollY - lastScrollY;
        
        if (window.scrollY > 60) {
          if (!topNavbar.classList.contains('nav-sticky')) {
            // Disable transition temporarily to prevent initial flash
            topNavbar.style.transition = 'none';
            topNavbar.classList.add('nav-sticky');
            document.body.style.paddingTop = '61px';
            
            // Force reflow
            void topNavbar.offsetHeight;
            
            // Restore transition
            topNavbar.style.transition = '';
          }
          
          if (delta < 0) {
            // Scrolling up
            scrollUpDistance += Math.abs(delta);
            scrollDownDistance = 0;
            
            // Show navbar if scrolled up by at least 30px
            if (scrollUpDistance > 30) {
              topNavbar.classList.add('nav-show');
            }
          } else if (delta > 0) {
            // Scrolling down
            scrollDownDistance += delta;
            scrollUpDistance = 0;
            
            // Hide navbar if scrolled down by at least 15px
            if (scrollDownDistance > 15) {
              topNavbar.classList.remove('nav-show');
            }
          }
        } else if (window.scrollY <= 0) {
          // Back at the very top -> restore normal flow
          topNavbar.classList.remove('nav-sticky', 'nav-show');
          document.body.style.paddingTop = '0';
          scrollUpDistance = 0;
          scrollDownDistance = 0;
        }
        
        lastScrollY = window.scrollY;
      });
    }
});
