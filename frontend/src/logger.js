export function initFrontendLogger() {
  const originalError = console.error;
  
  // Override console.error to intercept global errors and send to backend
  console.error = (...args) => {
    originalError(...args);
    
    // Safely parse the error arguments
    const errorMsg = args.map(arg => {
      if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Send silently to backend /api/logs endpoint
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'ERROR',
        message: errorMsg,
        url: window.location.href,
        userAgent: navigator.userAgent
      })
    }).catch(() => {
      // Ignore if the logging itself fails
    });
  };

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
  });

  // Capture global window errors
  window.addEventListener('error', (event) => {
    console.error('Global Window Error:', event.message, event.filename, event.lineno);
  });
}
