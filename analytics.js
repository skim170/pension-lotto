// Replace this with your GA4 Google tag ID.
// Example: G-ABC123DEF4
const GOOGLE_TAG_ID = "G-8YHXLEHYG3";

function gtag() {
  window.dataLayer.push(arguments);
}

function loadGoogleAnalytics() {
  if (!GOOGLE_TAG_ID) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", GOOGLE_TAG_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`;
  document.head.appendChild(script);
}

function trackEvent(name, params = {}) {
  if (!GOOGLE_TAG_ID || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

function bindAnalyticsEvents() {
  const trackedElements = document.querySelectorAll("[data-analytics-event]");

  for (const element of trackedElements) {
    element.addEventListener("click", () => {
      trackEvent(element.dataset.analyticsEvent, {
        element_id: element.id || "unknown",
        element_text: element.textContent.trim().slice(0, 100),
      });
    });
  }
}

loadGoogleAnalytics();
bindAnalyticsEvents();
