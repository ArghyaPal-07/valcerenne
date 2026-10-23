// Vercel Web Analytics initialization
// This script initializes Vercel Analytics tracking for the site

(function() {
  // Check if we're in production environment (deployed on Vercel)
  const isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
  
  // Initialize analytics queue
  if (!window.va) {
    window.va = function() {
      (window.vaq = window.vaq || []).push(arguments);
    };
  }

  // Only inject analytics in production
  if (!isDevelopment) {
    // Load the analytics script
    const script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    document.head.appendChild(script);
  }
})();
