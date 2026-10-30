/* global window, document, localStorage */
// Runs in <head> before the styles paint, so the page never flashes the wrong theme. It is an
// external file because the Content-Security-Policy allows no inline scripts (script-src 'self').
// It lives under /assets/ because the backend serves only /assets/**, /index.html and the favicon.
(function () {
  var choice = 'system';
  try {
    var stored = localStorage.getItem('mailpulse-theme');
    if (stored === 'light' || stored === 'dark') choice = stored;
  } catch {
    // storage blocked: follow the system setting
  }
  var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
