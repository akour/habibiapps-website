(() => {
  const measurementId = "G-WPJDCWYN5E";
  const consentKey = "habibiapps.analyticsConsent";
  const appNames = {
    "com.oneapps.voidstack": "void_stack",
    "com.oneapps.habibirun": "habibi_run",
  };
  let analyticsLoaded = false;
  let banner;

  function storedChoice() {
    try {
      return window.localStorage.getItem(consentKey);
    } catch {
      return null;
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "default", { analytics_storage: "granted" });
    window.gtag("config", measurementId, {
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_title: document.title,
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  function showBanner() {
    if (!banner) {
      banner = document.createElement("section");
      banner.className = "analytics-consent";
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-labelledby", "analytics-consent-title");
      banner.innerHTML = `
        <div class="analytics-consent__copy">
          <h2 id="analytics-consent-title">Your privacy choices</h2>
          <p>Allow Google Analytics to measure page visits and clicks to our Google Play and email links. You can change your choice at any time.</p>
          <a href="/privacy/">Read our privacy notice</a>
        </div>
        <div class="analytics-consent__actions">
          <button type="button" data-analytics-choice="allow">Allow analytics</button>
          <button type="button" data-analytics-choice="deny">Reject</button>
        </div>`;
      document.body.appendChild(banner);
      banner.addEventListener("click", (event) => {
        const choice = event.target.closest("button[data-analytics-choice]");
        if (!choice) return;
        const allowed = choice.dataset.analyticsChoice === "allow";
        try {
          window.localStorage.setItem(consentKey, allowed ? "granted" : "denied");
        } catch {
          // The choice still applies for this page view when storage is unavailable.
        }
        if (allowed) {
          loadAnalytics();
        } else {
          window[`ga-disable-${measurementId}`] = true;
          if (window.gtag) {
            window.gtag("consent", "update", { analytics_storage: "denied" });
          }
        }
        hideBanner();
      });
    }
    banner.hidden = false;
  }

  document.addEventListener("click", (event) => {
    if (storedChoice() !== "granted" || typeof window.gtag !== "function") return;
    const link = event.target.closest("a[href]");
    if (!link) return;

    let destination;
    try {
      destination = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (destination.hostname === "play.google.com" && destination.pathname === "/store/apps/details") {
      const appId = destination.searchParams.get("id");
      const appName = Object.hasOwn(appNames, appId) ? appNames[appId] : null;
      if (appName) window.gtag("event", "google_play_click", { app_name: appName });
      return;
    }

    if (destination.protocol === "mailto:") {
      window.gtag("event", "contact_email_click", { contact_method: "email" });
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-privacy-settings]")) {
      event.preventDefault();
      showBanner();
    }
  });

  const choice = storedChoice();
  if (choice === "granted") loadAnalytics();
  if (!choice || window.location.hash === "#privacy-settings") showBanner();
})();
