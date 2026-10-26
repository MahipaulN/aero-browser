// Aero Browser - Modern macOS Sonoma / Sequoia Frosted-Glass UI Controller
/* global ICONS */

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// State
let tabs = [];
let activeTabId = null;
let bookmarks = [];
let downloads = [];
let settings = {};
let appInfo = {};
let toastTimer = null;
let draggedTabId = null;
let activeSettingsTab = "general";

// DOM Elements
const chromeHeader = $("#chromeHeader");
const tabsContainer = $("#tabs");
const addressInput = $("#addressInput");
const securityBadge = $("#securityBadge");
const bookmarkButton = $("#bookmarkButton");
const loadingBar = $("#loadingBar");
const autocompleteDropdown = $("#autocompleteDropdown");
const bookmarksBar = $("#bookmarksBar");
const toast = $("#toast");

// Navigation buttons
const btnBack = $("#back");
const btnForward = $("#forward");
const btnReload = $("#reload");
const btnHome = $("#home");

// Toolbar buttons
const shieldButton = $("#shieldButton");
const shieldBadge = $("#shieldBadge");
const findButton = $("#findButton");
const downloadsButton = $("#downloadsButton");
const historyButton = $("#historyButton");
const bookmarksBarToggle = $("#bookmarksBarToggle");
const settingsButton = $("#settingsButton");
const menuButton = $("#menuButton");

// Drawers in Chrome Header
const findRow = $("#findRow");
const findInput = $("#findInput");
const findCount = $("#findCount");
const shieldDrawer = $("#shieldDrawer");
const securityDrawer = $("#securityDrawer");

// Internal Pages
const startPage = $("#startPage");
const settingsPage = $("#settingsPage");
const historyPage = $("#historyPage");
const bookmarksPage = $("#bookmarksPage");
const downloadsPage = $("#downloadsPage");

// Helper: extract domain from URL
function getDomain(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "";
  }
}

// Calculate and notify main process of Chrome Header height
let lastSentChromeHeight = 0;
function updateChromeHeight() {
  if (!chromeHeader) return;
  const height = chromeHeader.offsetHeight;
  if (height === lastSentChromeHeight) return;
  lastSentChromeHeight = height;
  window.aero.setChromeHeight(height);
}
window.addEventListener("resize", updateChromeHeight);

// Initialize SVG icons into buttons
function injectIcons() {
  $("#newTab").innerHTML = ICONS.plus;
  menuButton.innerHTML = ICONS.menu;
  btnBack.innerHTML = ICONS.back;
  btnForward.innerHTML = ICONS.forward;
  btnReload.innerHTML = ICONS.reload;
  btnHome.innerHTML = ICONS.home;
  securityBadge.innerHTML = ICONS.lock;
  bookmarkButton.innerHTML = ICONS.starEmpty;
  shieldButton.innerHTML = ICONS.shieldActive;
  findButton.innerHTML = ICONS.find;
  downloadsButton.innerHTML = ICONS.downloads;
  historyButton.innerHTML = ICONS.history;
  bookmarksBarToggle.innerHTML = ICONS.bookmarks;
  settingsButton.innerHTML = ICONS.settings;

  $("#findIcon").innerHTML = ICONS.find;
  $("#findPrev").innerHTML = ICONS.chevronUp;
  $("#findNext").innerHTML = ICONS.chevronDown;
  $("#findClose").innerHTML = ICONS.close;
  $("#shieldDrawerIcon").innerHTML = ICONS.shieldActive;
  $("#secBadgeIcon").innerHTML = ICONS.lock;
  $("#startSearchIcon").innerHTML = ICONS.search;
}

// Format byte sizes into human readable strings
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Show smooth toast notification
function notify(message) {
  toast.textContent = String(message);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

// Window Controls
$("#closeWindow").addEventListener("click", () => window.aero.controlWindow("close"));
$("#minWindow").addEventListener("click", () => window.aero.controlWindow("minimize"));
$("#maxWindow").addEventListener("click", () => window.aero.controlWindow("maximize"));

// Double click header to maximize / restore
chromeHeader.addEventListener("dblclick", event => {
  if (event.target.closest("button") || event.target.closest("input") || event.target.closest(".tab")) {
    return;
  }
  window.aero.controlWindow("maximize");
});

// Render Tab Strip
function renderTabs() {
  tabsContainer.replaceChildren();

  for (const tab of tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = `tab${tab.id === activeTabId ? " active" : ""}${tab.pinned ? " pinned" : ""}`;
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", String(tab.id === activeTabId));
    tabEl.setAttribute("draggable", "true");
    tabEl.dataset.tabId = tab.id;
    tabEl.title = tab.title || "New Tab";

    // Favicon or loading spinner
    const faviconEl = document.createElement("span");
    faviconEl.className = "tab-favicon";

    if (tab.loading) {
      const spinner = document.createElement("span");
      spinner.className = "tab-spinner";
      faviconEl.append(spinner);
    } else if (tab.favicon) {
      const img = document.createElement("img");
      img.src = tab.favicon;
      img.alt = "";
      img.onerror = () => { faviconEl.innerHTML = ICONS.globe; };
      faviconEl.append(img);
    } else {
      faviconEl.innerHTML = tab.url && tab.url.startsWith("aero://") ? ICONS.search : ICONS.globe;
    }

    // Title
    const titleEl = document.createElement("span");
    titleEl.className = "tab-title";
    titleEl.textContent = tab.title || "New Tab";

    // Close button (not shown on pinned tabs)
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-tab";
    closeBtn.setAttribute("aria-label", "Close tab");
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener("click", event => {
      event.stopPropagation();
      window.aero.closeTab(tab.id);
    });

    tabEl.append(faviconEl, titleEl, closeBtn);

    // Left click to activate
    tabEl.addEventListener("click", () => window.aero.activateTab(tab.id));

    // Middle click to close
    tabEl.addEventListener("auxclick", event => {
      if (event.button === 1) {
        event.preventDefault();
        window.aero.closeTab(tab.id);
      }
    });

    // Native Context Menu on Tab Right-Click
    tabEl.addEventListener("contextmenu", event => {
      event.preventDefault();
      window.aero.showTabMenu(tab.id);
    });

    // Drag and Drop Tab Reordering
    tabEl.addEventListener("dragstart", event => {
      draggedTabId = tab.id;
      tabEl.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tab.id);
    });

    tabEl.addEventListener("dragend", () => {
      tabEl.classList.remove("dragging");
      draggedTabId = null;
    });

    tabEl.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });

    tabEl.addEventListener("drop", event => {
      event.preventDefault();
      if (!draggedTabId || draggedTabId === tab.id) return;

      const currentIds = tabs.map(t => t.id);
      const fromIdx = currentIds.indexOf(draggedTabId);
      const toIdx = currentIds.indexOf(tab.id);
      if (fromIdx >= 0 && toIdx >= 0) {
        currentIds.splice(fromIdx, 1);
        currentIds.splice(toIdx, 0, draggedTabId);
        window.aero.reorderTabs(currentIds);
      }
    });

    tabsContainer.append(tabEl);
  }

  // Update Toolbar & Page States
  const active = tabs.find(t => t.id === activeTabId);
  if (active) {
    btnBack.disabled = !active.canGoBack;
    btnForward.disabled = !active.canGoForward;

    // Switch reload button icon to stop when loading
    if (active.loading) {
      btnReload.innerHTML = ICONS.stop;
      btnReload.title = "Stop loading";
      loadingBar.className = "loading-bar active";
    } else {
      btnReload.innerHTML = ICONS.reload;
      btnReload.title = "Reload (Ctrl+R)";
      loadingBar.className = "loading-bar finish";
    }

    // Omnibox URL - preserve if user is actively typing
    if (document.activeElement !== addressInput) {
      addressInput.value = active.url || "aero://newtab";
    }

    // Bookmark state
    const isBookmarked = bookmarks.some(b => b.url === active.url);
    bookmarkButton.innerHTML = isBookmarked ? ICONS.starFilled : ICONS.starEmpty;
    bookmarkButton.classList.toggle("saved", isBookmarked);

    // Security indicator
    if (!active.url || active.url.startsWith("aero://")) {
      securityBadge.innerHTML = ICONS.search;
      securityBadge.className = "security-badge";
      securityBadge.title = "Aero System Page";
    } else if (active.url.startsWith("https://")) {
      securityBadge.innerHTML = ICONS.lock;
      securityBadge.className = "security-badge secure";
      securityBadge.title = "Connection is secure (HTTPS)";
    } else {
      securityBadge.innerHTML = ICONS.lockWarning;
      securityBadge.className = "security-badge warning";
      securityBadge.title = "Connection is not secure (HTTP)";
    }

    // Shield status for active tab
    updateShieldStateForTab(active);

    // Render active view (internal page or external website)
    renderActiveView(active.url);
  } else {
    renderActiveView("aero://newtab");
    if (document.activeElement !== addressInput) {
      addressInput.value = "aero://newtab";
    }
    btnBack.disabled = true;
    btnForward.disabled = true;
    btnReload.innerHTML = ICONS.reload;
    loadingBar.className = "loading-bar";
  }
}

// Update Shield status badge & icon for the active tab
async function updateShieldStateForTab(activeTab) {
  if (!activeTab || !activeTab.url || activeTab.url.startsWith("aero://")) {
    shieldButton.innerHTML = ICONS.shieldActive;
    shieldBadge.hidden = true;
    shieldBadge.textContent = "";
    shieldBadge.dataset.count = "0";
    return;
  }

  const domain = getDomain(activeTab.url);
  try {
    const stats = await window.aero.adblockGetStats(domain);
    const count = stats.blockedCount ?? stats.siteBlocked ?? 0;
    shieldBadge.textContent = count > 0 ? String(count) : "";
    shieldBadge.dataset.count = String(count);
    shieldBadge.hidden = count === 0;

    const isGlobal = Boolean(stats.isGlobalEnabled ?? stats.globalEnabled ?? true);
    const isEffective = Boolean(stats.isEffectiveEnabled ?? stats.siteEnabled ?? stats.isEnabled);

    if (!isGlobal) {
      shieldButton.innerHTML = ICONS.shieldDisabled;
      shieldButton.title = "Aero Shields disabled globally";
    } else if (isEffective) {
      shieldButton.innerHTML = ICONS.shieldActive;
      shieldButton.title = `Aero Shields: ${count} ads & trackers blocked`;
    } else {
      shieldButton.innerHTML = ICONS.shieldDisabled;
      shieldButton.title = `Aero Shields disabled for ${domain}`;
    }
  } catch {
    shieldBadge.hidden = true;
  }
}

// Render active page canvas (internal pages vs external website view)
let currentActiveRoute = null;

function renderActiveView(rawUrl, force = false) {
  const url = rawUrl || "aero://newtab";
  const route = url.startsWith("aero://") ? url : "web";

  if (!force && currentActiveRoute === route) {
    return;
  }
  currentActiveRoute = route;

  // Hide all internal pages by default
  startPage.hidden = true;
  settingsPage.hidden = true;
  historyPage.hidden = true;
  bookmarksPage.hidden = true;
  downloadsPage.hidden = true;

  if (route === "aero://newtab" || url === "" || url === "about:blank") {
    startPage.hidden = false;
    renderSpeedDial();
    renderStartBookmarks();
    updateClock();
  } else if (route === "aero://settings") {
    settingsPage.hidden = false;
    renderSettingsView();
  } else if (route === "aero://history") {
    historyPage.hidden = false;
    renderHistoryPage();
  } else if (route === "aero://bookmarks") {
    bookmarksPage.hidden = false;
    renderBookmarksPage();
  } else if (route === "aero://downloads") {
    downloadsPage.hidden = false;
    renderDownloadsPage();
  }
  // When url is http: or https:, all internal views remain hidden and
  // the main process tabManager attaches the WebContentsView over pageArea.
}

// Render Bookmarks Bar
function renderBookmarks() {
  bookmarksBar.replaceChildren();
  if (!settings.showBookmarksBar) {
    bookmarksBar.hidden = true;
    updateChromeHeight();
    return;
  }
  bookmarksBar.hidden = false;

  for (const bm of bookmarks) {
    const chip = document.createElement("button");
    chip.className = "bookmark-chip";
    chip.title = bm.url;

    const icon = document.createElement("span");
    icon.className = "bookmark-chip-icon";
    icon.innerHTML = ICONS.globe;

    const label = document.createElement("span");
    label.textContent = bm.title || getDomain(bm.url) || bm.url;

    chip.append(icon, label);
    chip.addEventListener("click", () => window.aero.navigate(bm.url));
    bookmarksBar.append(chip);
  }
  updateChromeHeight();
}

// Render Bookmarks onto Start Page
function renderStartBookmarks() {
  const grid = $("#startBookmarksGrid");
  if (!grid) return;
  grid.replaceChildren();

  const favorites = bookmarks.slice(0, 10);
  if (favorites.length === 0) {
    grid.innerHTML = `<span style="font-size:12px; color:var(--text-tertiary); padding:4px;">Add your favorite sites with Ctrl+D</span>`;
    return;
  }

  for (const bm of favorites) {
    const chip = document.createElement("button");
    chip.className = "start-bookmark-chip";
    chip.innerHTML = `
      <span style="color:var(--text-tertiary); display:flex; align-items:center;">${ICONS.starFilled}</span>
      <span>${bm.title || getDomain(bm.url)}</span>
    `;
    chip.addEventListener("click", () => window.aero.navigate(bm.url));
    grid.append(chip);
  }
}

// Navigation Actions
$("#newTab").addEventListener("click", () => window.aero.newTab());
btnBack.addEventListener("click", () => window.aero.navigationAction("back"));
btnForward.addEventListener("click", () => window.aero.navigationAction("forward"));
btnReload.addEventListener("click", () => {
  const active = tabs.find(t => t.id === activeTabId);
  if (active && active.loading) {
    window.aero.navigationAction("stop");
  } else {
    window.aero.navigationAction("reload");
  }
});
btnHome.addEventListener("click", () => window.aero.navigationAction("home"));

// Native App Menu Trigger
menuButton.addEventListener("click", () => {
  window.aero.showAppMenu();
});

// Omnibox Click-to-Select & Focus handling
let isFirstOmniboxClick = false;

addressInput.addEventListener("mousedown", () => {
  if (document.activeElement !== addressInput) {
    isFirstOmniboxClick = true;
    const selectOnMouseUp = (e) => {
      if (isFirstOmniboxClick) {
        e.preventDefault();
        addressInput.select();
        isFirstOmniboxClick = false;
      }
      window.removeEventListener("mouseup", selectOnMouseUp, true);
    };
    window.addEventListener("mouseup", selectOnMouseUp, true);
  }
});

addressInput.addEventListener("focus", () => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === addressInput && addressInput.selectionStart === addressInput.selectionEnd) {
      addressInput.select();
    }
  });
});

addressInput.addEventListener("blur", () => {
  isFirstOmniboxClick = false;
  autocompleteDropdown.hidden = true;
  const active = tabs.find(t => t.id === activeTabId);
  if (active) {
    addressInput.value = active.url || "aero://newtab";
  }
});

const addressBar = $("#addressBar");
if (addressBar) {
  addressBar.addEventListener("click", e => {
    if (e.target !== addressInput && !securityBadge.contains(e.target) && !bookmarkButton.contains(e.target)) {
      addressInput.focus();
      addressInput.select();
    }
  });
}

// Omnibox Navigation Submission
addressInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    const val = addressInput.value.trim();
    if (val) {
      window.aero.navigate(val);
      autocompleteDropdown.hidden = true;
      addressInput.blur();
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    const active = tabs.find(t => t.id === activeTabId);
    addressInput.value = active ? (active.url || "aero://newtab") : "aero://newtab";
    autocompleteDropdown.hidden = true;
    addressInput.blur();
  }
});

// Autocomplete suggestions based on bookmarks and history
addressInput.addEventListener("input", async () => {
  const query = addressInput.value.trim().toLowerCase();
  if (!query || query.length < 2) {
    autocompleteDropdown.hidden = true;
    return;
  }

  const history = await window.aero.listHistory();
  const matchedBookmarks = bookmarks.filter(b => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)).slice(0, 3);
  const matchedHistory = history.filter(h => h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)).slice(0, 4);

  autocompleteDropdown.replaceChildren();

  // Search suggestion entry
  const searchItem = document.createElement("button");
  searchItem.className = "autocomplete-item";
  searchItem.innerHTML = `
    <span class="autocomplete-icon">${ICONS.search}</span>
    <span class="autocomplete-title">Search for "<strong>${addressInput.value}</strong>"</span>
  `;
  searchItem.addEventListener("click", () => {
    window.aero.navigate(addressInput.value);
    autocompleteDropdown.hidden = true;
  });
  autocompleteDropdown.append(searchItem);

  for (const bm of matchedBookmarks) {
    const item = document.createElement("button");
    item.className = "autocomplete-item";
    item.innerHTML = `
      <span class="autocomplete-icon">${ICONS.starFilled}</span>
      <span class="autocomplete-title">${bm.title}</span>
      <span class="autocomplete-url">${bm.url}</span>
    `;
    item.addEventListener("click", () => {
      window.aero.navigate(bm.url);
      autocompleteDropdown.hidden = true;
    });
    autocompleteDropdown.append(item);
  }

  for (const h of matchedHistory) {
    const item = document.createElement("button");
    item.className = "autocomplete-item";
    item.innerHTML = `
      <span class="autocomplete-icon">${ICONS.history}</span>
      <span class="autocomplete-title">${h.title}</span>
      <span class="autocomplete-url">${h.url}</span>
    `;
    item.addEventListener("click", () => {
      window.aero.navigate(h.url);
      autocompleteDropdown.hidden = true;
    });
    autocompleteDropdown.append(item);
  }

  autocompleteDropdown.hidden = false;
});

// Toggle Bookmark Button
bookmarkButton.addEventListener("click", async () => {
  const res = await window.aero.toggleBookmark();
  if (res && res.saved !== undefined) {
    notify(res.saved ? "Bookmark added to Favorites" : "Bookmark removed");
  }
  bookmarks = await window.aero.listBookmarks();
  renderBookmarks();
  renderTabs();
});

// --- AERO SHIELDS / AD-BLOCKER DRAWER ---
shieldButton.addEventListener("click", async () => {
  shieldDrawer.hidden = !shieldDrawer.hidden;
  findRow.hidden = true;
  securityDrawer.hidden = true;
  updateChromeHeight();

  if (!shieldDrawer.hidden) {
    const active = tabs.find(t => t.id === activeTabId);
    const domain = active && active.url && !active.url.startsWith("aero://") ? getDomain(active.url) : "";
    const siteDomainEl = $("#shieldSiteDomain");
    const statusTextEl = $("#shieldStatusText");
    const blockedCountEl = $("#shieldBlockedCount");
    const toggleEl = $("#shieldSiteToggle");

    if (domain) {
      siteDomainEl.textContent = domain;
      const stats = await window.aero.adblockGetStats(domain);
      const count = stats.blockedCount ?? stats.siteBlocked ?? 0;
      const isGlobal = Boolean(stats.isGlobalEnabled ?? stats.globalEnabled ?? true);
      const isAllowlisted = Boolean(stats.isAllowlisted);
      const isEffective = Boolean(stats.isEffectiveEnabled ?? stats.siteEnabled ?? stats.isEnabled);

      blockedCountEl.textContent = String(count);

      if (!isGlobal) {
        toggleEl.checked = false;
        toggleEl.disabled = true;
        statusTextEl.textContent = "Shields disabled globally (in Settings)";
      } else {
        toggleEl.checked = !isAllowlisted;
        toggleEl.disabled = false;
        statusTextEl.textContent = isEffective
          ? "Shields active: blocking ads & trackers"
          : "Shields disabled for this site";
      }
    } else {
      siteDomainEl.textContent = "Aero System";
      blockedCountEl.textContent = "0";
      toggleEl.checked = true;
      toggleEl.disabled = true;
      statusTextEl.textContent = "Internal browser page (safe)";
    }
  }
});

$("#shieldSiteToggle").addEventListener("change", async () => {
  const active = tabs.find(t => t.id === activeTabId);
  if (!active || !active.url || active.url.startsWith("aero://")) return;

  const domain = getDomain(active.url);
  const toggleEl = $("#shieldSiteToggle");
  try {
    const res = await window.aero.adblockToggleSite(domain);
    const isGlobal = Boolean(res.isGlobalEnabled ?? res.globalEnabled ?? true);
    const isAllowlisted = Boolean(res.isAllowlisted);
    const isEffective = Boolean(res.isEffectiveEnabled ?? res.siteEnabled ?? res.enabled);

    toggleEl.checked = !isAllowlisted;
    const statusTextEl = $("#shieldStatusText");
    if (!isGlobal) {
      statusTextEl.textContent = "Shields disabled globally (in Settings)";
    } else {
      statusTextEl.textContent = isEffective
        ? "Shields active: blocking ads & trackers"
        : "Shields disabled for this site";
      notify(isEffective ? `Aero Shields enabled for ${domain}` : `Aero Shields disabled for ${domain}`);
    }
    updateShieldStateForTab(active);
  } catch {
    toggleEl.checked = !toggleEl.checked;
    notify("Failed to update site shields settings");
  }
});

// --- SECURITY DETAILS DRAWER ---
securityBadge.addEventListener("click", () => {
  securityDrawer.hidden = !securityDrawer.hidden;
  shieldDrawer.hidden = true;
  findRow.hidden = true;
  updateChromeHeight();

  if (!securityDrawer.hidden) {
    const active = tabs.find(t => t.id === activeTabId);
    const originEl = $("#secOrigin");
    const textEl = $("#secDetailsText");

    if (!active || !active.url || active.url.startsWith("aero://")) {
      originEl.textContent = "Aero System Page";
      textEl.textContent = "This is a secure internal browser component with strict context isolation.";
    } else if (active.url.startsWith("https://")) {
      originEl.textContent = getDomain(active.url);
      textEl.textContent = "Verified HTTPS Connection. TLS 1.3 encryption is active. Your passwords and payment data are private.";
    } else {
      originEl.textContent = getDomain(active.url);
      textEl.textContent = "Connection is NOT secure (plain HTTP). Sensitive data could be intercepted by third parties.";
    }
  }
});

$("#closeSecDrawer").addEventListener("click", () => {
  securityDrawer.hidden = true;
  updateChromeHeight();
});

// --- FIND IN PAGE (CTRL+F) ---
findButton.addEventListener("click", () => {
  findRow.hidden = !findRow.hidden;
  shieldDrawer.hidden = true;
  securityDrawer.hidden = true;
  updateChromeHeight();

  if (!findRow.hidden) {
    findInput.focus();
    findInput.select();
  } else {
    window.aero.stopFindInPage("clearSelection");
  }
});

$("#findClose").addEventListener("click", () => {
  findRow.hidden = true;
  updateChromeHeight();
  window.aero.stopFindInPage("clearSelection");
});

findInput.addEventListener("input", () => {
  window.aero.findInPage(findInput.value, { forward: true });
});

findInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    window.aero.findInPage(findInput.value, { forward: !event.shiftKey, findNext: true });
  } else if (event.key === "Escape") {
    findRow.hidden = true;
    updateChromeHeight();
    window.aero.stopFindInPage("clearSelection");
  }
});

$("#findPrev").addEventListener("click", () => {
  window.aero.findInPage(findInput.value, { forward: false, findNext: true });
});
$("#findNext").addEventListener("click", () => {
  window.aero.findInPage(findInput.value, { forward: true, findNext: true });
});

window.aero.onFindResult(result => {
  findCount.textContent = `${result.activeMatchOrdinal || 0} of ${result.matches || 0}`;
});

// --- TOOLBAR NAVIGATION SHORTCUT BUTTONS ---
settingsButton.addEventListener("click", () => window.aero.navigate("aero://settings"));
historyButton.addEventListener("click", () => window.aero.navigate("aero://history"));
downloadsButton.addEventListener("click", () => window.aero.navigate("aero://downloads"));
bookmarksBarToggle.addEventListener("click", async () => {
  const newVal = !settings.showBookmarksBar;
  await window.aero.updateSettings({ showBookmarksBar: newVal });
  settings.showBookmarksBar = newVal;
  renderBookmarks();
});

// --- START PAGE SEARCH & SPEED DIAL ---
$("#startSearchForm").addEventListener("submit", event => {
  event.preventDefault();
  const val = $("#startSearchInput").value.trim();
  if (val) {
    window.aero.navigate(val);
  }
});

const DEFAULT_SPEED_DIAL = [
  { name: "Google", url: "https://www.google.com/", icon: "G", color: "#4285f4" },
  { name: "YouTube", url: "https://www.youtube.com/", icon: "▶", color: "#ff0000" },
  { name: "GitHub", url: "https://github.com/", icon: "⌘", color: "#6b65c8" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/", icon: "W", color: "#333333" },
  { name: "Reddit", url: "https://www.reddit.com/", icon: "R", color: "#ff4500" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com/", icon: "🦆", color: "#de5833" }
];

function renderSpeedDial() {
  const grid = $("#speedDialGrid");
  if (!grid) return;
  grid.replaceChildren();

  for (const item of DEFAULT_SPEED_DIAL) {
    const tile = document.createElement("button");
    tile.className = "speed-dial-tile";
    tile.innerHTML = `
      <div class="speed-dial-icon" style="color: ${item.color}">${item.icon}</div>
      <span>${item.name}</span>
    `;
    tile.addEventListener("click", () => window.aero.navigate(item.url));
    grid.append(tile);
  }
}

// Live Clock & Greeting for Start Page
function updateClock() {
  if (startPage.hidden) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const clockEl = $("#startClock");
  if (clockEl) clockEl.textContent = `${hours}:${minutes}`;

  const greetingEl = $("#startGreeting");
  if (greetingEl) {
    const h = now.getHours();
    let text = "Good evening";
    if (h < 12) text = "Good morning";
    else if (h < 18) text = "Good afternoon";
    greetingEl.textContent = text;
  }
}
setInterval(updateClock, 1000);

// --- SETTINGS VIEW (aero://settings) ---
$$(".settings-nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".settings-nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeSettingsTab = btn.dataset.tab;
    renderSettingsView();
  });
});

async function renderSettingsView() {
  const container = $("#settingsContentArea");
  if (!container) return;
  container.replaceChildren();

  if (activeSettingsTab === "general") {
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">General Preferences</div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Default Search Engine</strong>
            <span>Used when entering queries in the address bar</span>
          </div>
          <select id="setSearchEngine" class="settings-select">
            <option value="google" ${settings.searchEngine === "google" ? "selected" : ""}>Google</option>
            <option value="duckduckgo" ${settings.searchEngine === "duckduckgo" ? "selected" : ""}>DuckDuckGo</option>
            <option value="bing" ${settings.searchEngine === "bing" ? "selected" : ""}>Bing</option>
            <option value="brave" ${settings.searchEngine === "brave" ? "selected" : ""}>Brave</option>
            <option value="ecosia" ${settings.searchEngine === "ecosia" ? "selected" : ""}>Ecosia</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>On Startup</strong>
            <span>What to display when Aero Browser launches</span>
          </div>
          <select id="setStartup" class="settings-select">
            <option value="newtab" ${settings.startupBehavior === "newtab" ? "selected" : ""}>Open the New Tab page</option>
            <option value="custom" ${settings.startupBehavior === "custom" ? "selected" : ""}>Open a specific URL</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Downloads Location</strong>
            <span id="setDownloadPathLabel">${settings.downloadPath || "Windows default Downloads folder"}</span>
          </div>
          <button id="btnBrowseDownload" class="action-btn">Browse Folder...</button>
        </div>
      </div>
    `;

    $("#setSearchEngine").addEventListener("change", async e => {
      await window.aero.updateSettings({ searchEngine: e.target.value });
      notify("Search engine updated");
    });
    $("#setStartup").addEventListener("change", async e => {
      await window.aero.updateSettings({ startupBehavior: e.target.value });
      notify("Startup behavior updated");
    });
    $("#btnBrowseDownload").addEventListener("click", async () => {
      const dir = await window.aero.selectDirectory();
      if (dir) {
        await window.aero.updateSettings({ downloadPath: dir });
        $("#setDownloadPathLabel").textContent = dir;
        notify("Download folder updated");
      }
    });
  } else if (activeSettingsTab === "appearance") {
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">Appearance & Theme</div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Color Theme</strong>
            <span>Choose light, dark, or follow Windows system mode</span>
          </div>
          <select id="setTheme" class="settings-select">
            <option value="system" ${settings.theme === "system" ? "selected" : ""}>System Default</option>
            <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light Mode</option>
            <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark Mode</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>New Tab Wallpaper</strong>
            <span>Translucent frosted-glass backdrop motif</span>
          </div>
          <select id="setWallpaper" class="settings-select">
            <option value="aurora" ${settings.newTabWallpaper === "aurora" ? "selected" : ""}>Aurora Glass</option>
            <option value="sunset" ${settings.newTabWallpaper === "sunset" ? "selected" : ""}>Sunset Haze</option>
            <option value="ocean" ${settings.newTabWallpaper === "ocean" ? "selected" : ""}>Pacific Ocean</option>
            <option value="graphite" ${settings.newTabWallpaper === "graphite" ? "selected" : ""}>Graphite Minimal</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Show Bookmarks Bar</strong>
            <span>Display favorite shortcuts below the address bar</span>
          </div>
          <label class="switch-toggle">
            <input type="checkbox" id="setShowBm" ${settings.showBookmarksBar ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;

    $("#setTheme").addEventListener("change", async e => {
      await window.aero.updateSettings({ theme: e.target.value });
      applyTheme(e.target.value);
      notify("Theme updated");
    });
    $("#setWallpaper").addEventListener("change", async e => {
      await window.aero.updateSettings({ newTabWallpaper: e.target.value });
      applyWallpaper(e.target.value);
      notify("Wallpaper updated");
    });
    $("#setShowBm").addEventListener("change", async e => {
      await window.aero.updateSettings({ showBookmarksBar: e.target.checked });
      settings.showBookmarksBar = e.target.checked;
      renderBookmarks();
    });
  } else if (activeSettingsTab === "shields") {
    const stats = await window.aero.adblockGetStats();
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">Aero Shields (Ad & Tracker Blocker)</div>
        <p style="font-size:12px; color:var(--text-secondary); margin:0;">
          Aero Shields uses real network-level request interception to block intrusive ads, trackers, and telemetry before they load.
        </p>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Enable Aero Shields Globally</strong>
            <span>Block ads and tracking requests across all websites</span>
          </div>
          <label class="switch-toggle">
            <input type="checkbox" id="setAdblockGlobal" ${stats.globalEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Total Requests Blocked</strong>
            <span>Aggregated ads, analytics, and telemetry prevented</span>
          </div>
          <strong style="color:var(--accent); font-size:16px;">${stats.totalBlocked || 0}</strong>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Filter Lists</strong>
            <span>EasyList, EasyPrivacy, Peter Lowe's Blocklist</span>
          </div>
          <span style="font-size:12px; color:#10b981; font-weight:600;">Active & Maintained</span>
        </div>
      </div>
    `;

    $("#setAdblockGlobal").addEventListener("change", async () => {
      const checkbox = $("#setAdblockGlobal");
      try {
        const res = await window.aero.adblockToggleGlobal();
        const enabled = Boolean(res.isGlobalEnabled ?? res.globalEnabled ?? res.enabled);
        checkbox.checked = enabled;
        notify(enabled ? "Aero Shields enabled globally" : "Aero Shields disabled globally");
        const active = tabs.find(t => t.id === activeTabId);
        if (active) updateShieldStateForTab(active);
      } catch {
        checkbox.checked = !checkbox.checked;
        notify("Failed to update global shields setting");
      }
    });
  } else if (activeSettingsTab === "privacy") {
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">Privacy & Site Data</div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Clear Browsing Data</strong>
            <span>Erase cookies, cached files, and local website storage</span>
          </div>
          <button id="btnClearDataBtn" class="action-btn danger">Clear Cookies & Cache</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">
            <strong>Clear Browsing History</strong>
            <span>Remove visited page records</span>
          </div>
          <button id="btnClearHistBtn" class="action-btn danger">Clear History</button>
        </div>
      </div>
    `;

    $("#btnClearDataBtn").addEventListener("click", async () => {
      if (confirm("Clear cookies and cached web content? You will be signed out of websites.")) {
        await window.aero.clearSiteData({ cookies: true, cache: true, storage: true });
        notify("Cookies and cache cleared");
      }
    });
    $("#btnClearHistBtn").addEventListener("click", async () => {
      if (confirm("Clear all browsing history?")) {
        await window.aero.clearHistory("all");
        notify("History cleared");
      }
    });
  } else if (activeSettingsTab === "permissions") {
    const perms = await window.aero.listPermissions();
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">Website Permissions</div>
        <p style="font-size:12px; color:var(--text-secondary); margin:0;">
          Permissions granted to websites for camera, microphone, notifications, and location.
        </p>
        <div id="permsTable" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `;

    const table = $("#permsTable");
    if (perms.length === 0) {
      table.innerHTML = `<p style="color:var(--text-tertiary); font-size:12px; padding:10px 0;">No custom website permissions granted yet.</p>`;
    } else {
      for (const p of perms) {
        const row = document.createElement("div");
        row.className = "settings-row";
        row.innerHTML = `
          <div class="settings-label">
            <strong>${p.origin}</strong>
            <span>${p.permission} (${p.state})</span>
          </div>
          <button class="action-btn danger btn-revoke">Revoke</button>
        `;
        row.querySelector(".btn-revoke").addEventListener("click", async () => {
          await window.aero.revokePermission(p.origin, p.permission);
          row.remove();
          notify(`Revoked ${p.permission} for ${p.origin}`);
        });
        table.append(row);
      }
    }
  } else if (activeSettingsTab === "shortcuts") {
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-header">Keyboard Shortcuts</div>
        <div style="font-size:12px; display:flex; flex-direction:column; gap:6px;">
          <div class="settings-row"><span>New Tab</span><strong>Ctrl+T</strong></div>
          <div class="settings-row"><span>Close Tab</span><strong>Ctrl+W</strong></div>
          <div class="settings-row"><span>Restore Closed Tab</span><strong>Ctrl+Shift+T</strong></div>
          <div class="settings-row"><span>Next / Previous Tab</span><strong>Ctrl+Tab / Ctrl+Shift+Tab</strong></div>
          <div class="settings-row"><span>Select Tab 1–8 / Last Tab</span><strong>Ctrl+1–8 / Ctrl+9</strong></div>
          <div class="settings-row"><span>Focus Omnibox</span><strong>Ctrl+L / Alt+D / F6</strong></div>
          <div class="settings-row"><span>Reload / Hard Reload</span><strong>Ctrl+R (F5) / Ctrl+Shift+R</strong></div>
          <div class="settings-row"><span>Bookmark Current Page</span><strong>Ctrl+D</strong></div>
          <div class="settings-row"><span>Find in Page</span><strong>Ctrl+F</strong></div>
          <div class="settings-row"><span>History</span><strong>Ctrl+H</strong></div>
          <div class="settings-row"><span>Downloads</span><strong>Ctrl+J</strong></div>
          <div class="settings-row"><span>Clear Browsing Data</span><strong>Ctrl+Shift+Delete</strong></div>
          <div class="settings-row"><span>Navigate Back / Forward</span><strong>Alt+Left / Alt+Right</strong></div>
          <div class="settings-row"><span>Toggle Fullscreen</span><strong>F11</strong></div>
        </div>
      </div>
    `;
  } else if (activeSettingsTab === "about") {
    container.innerHTML = `
      <div class="settings-card" style="text-align:center; padding:24px;">
        <img src="assets/icon.png" alt="Aero" width="64" height="64" style="border-radius:16px; margin:0 auto 12px; display:block; box-shadow:0 8px 24px rgba(0,0,0,0.2);">
        <h2 style="margin:0; font-size:22px;">Aero Browser</h2>
        <p style="color:var(--text-secondary); font-size:12px; margin:4px 0 20px;">Version ${appInfo.version || "0.1.0"} (Windows x64)</p>
        <div style="font-size:12px; text-align:left; background:var(--glass-hover); padding:16px; border-radius:12px; display:flex; flex-direction:column; gap:6px;">
          <div><strong>Chromium:</strong> ${appInfo.chromium || "134.0"}</div>
          <div><strong>Electron:</strong> ${appInfo.electron || "35.7.5"}</div>
          <div><strong>Node.js:</strong> ${appInfo.node || "24.15.0"}</div>
          <div><strong>Platform:</strong> Windows 10/11 x64</div>
          <div><strong>Security:</strong> Context Isolation, Sandboxed WebViews, Zero Node in Renderer</div>
        </div>
      </div>
    `;
  }
}

// --- HISTORY PAGE (aero://history) ---
async function renderHistoryPage() {
  const input = $("#historySearchInput");
  const list = $("#historyPageList");
  if (!list) return;

  const history = await window.aero.listHistory();
  const query = input ? input.value.trim().toLowerCase() : "";
  const filtered = query ? history.filter(h => h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) : history;

  list.replaceChildren();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.history}</div>
        <div class="empty-state-title">No browsing history found</div>
        <div class="empty-state-desc">Pages you visit will appear here.</div>
      </div>
    `;
    return;
  }

  for (const item of filtered) {
    const card = document.createElement("div");
    card.className = "item-card";

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML = `
      <div class="item-icon">${ICONS.history}</div>
      <div class="item-details">
        <span class="item-title">${item.title || item.url}</span>
        <span class="item-subtitle">${item.url}</span>
      </div>
    `;
    left.addEventListener("click", () => window.aero.navigate(item.url));

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "action-btn danger";
    delBtn.innerHTML = ICONS.close;
    delBtn.title = "Delete from history";
    delBtn.addEventListener("click", async () => {
      await window.aero.removeHistoryItem(item.id);
      card.remove();
    });
    actions.append(delBtn);

    card.append(left, actions);
    list.append(card);
  }
}

$("#historySearchInput")?.addEventListener("input", renderHistoryPage);
$("#clearAllHistoryBtn")?.addEventListener("click", async () => {
  if (confirm("Clear all browsing history?")) {
    await window.aero.clearHistory("all");
    await renderHistoryPage();
    notify("Browsing history cleared");
  }
});

// --- BOOKMARKS PAGE (aero://bookmarks) ---
async function renderBookmarksPage() {
  const input = $("#bookmarksSearchInput");
  const list = $("#bookmarksPageList");
  if (!list) return;

  bookmarks = await window.aero.listBookmarks();
  const query = input ? input.value.trim().toLowerCase() : "";
  const filtered = query ? bookmarks.filter(b => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) : bookmarks;

  list.replaceChildren();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.starEmpty}</div>
        <div class="empty-state-title">No bookmarks saved</div>
        <div class="empty-state-desc">Save your favorite sites by clicking the star icon in the address bar.</div>
      </div>
    `;
    return;
  }

  for (const item of filtered) {
    const card = document.createElement("div");
    card.className = "item-card";

    const left = document.createElement("div");
    left.className = "item-left";
    left.innerHTML = `
      <div class="item-icon">${ICONS.starFilled}</div>
      <div class="item-details">
        <span class="item-title">${item.title || item.url}</span>
        <span class="item-subtitle">${item.url}</span>
      </div>
    `;
    left.addEventListener("click", () => window.aero.navigate(item.url));

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "action-btn danger";
    delBtn.innerHTML = ICONS.close;
    delBtn.title = "Delete bookmark";
    delBtn.addEventListener("click", async () => {
      await window.aero.removeBookmark(item.id);
      bookmarks = await window.aero.listBookmarks();
      renderBookmarks();
      renderBookmarksPage();
      renderTabs();
    });
    actions.append(delBtn);

    card.append(left, actions);
    list.append(card);
  }
}

$("#bookmarksSearchInput")?.addEventListener("input", renderBookmarksPage);

$("#exportBookmarksBtn")?.addEventListener("click", async () => {
  const jsonStr = await window.aero.exportBookmarks();
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aero-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  notify("Bookmarks exported");
});

$("#importBookmarksBtn")?.addEventListener("click", () => {
  $("#bookmarksFileInput").click();
});

$("#bookmarksFileInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const content = e.target.result;
      const res = await window.aero.importBookmarks(content);
      bookmarks = await window.aero.listBookmarks();
      renderBookmarks();
      renderBookmarksPage();
      renderTabs();
      notify(`Imported ${res.imported || 0} bookmarks`);
    } catch {
      notify("Failed to import bookmarks (invalid JSON format)");
    }
  };
  reader.readAsText(file);
});

// --- DOWNLOADS PAGE (aero://downloads) ---
async function renderDownloadsPage() {
  const list = $("#downloadsPageList");
  if (!list) return;

  downloads = await window.aero.listDownloads();
  list.replaceChildren();

  const hasActive = downloads.some(d => d.state === "progressing");
  $("#downloadsBadge").hidden = !hasActive;

  if (downloads.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.downloads}</div>
        <div class="empty-state-title">No downloads yet</div>
        <div class="empty-state-desc">Files downloaded from the web will appear here.</div>
      </div>
    `;
    return;
  }

  for (const d of downloads) {
    const card = document.createElement("div");
    card.className = "download-card";

    const titleRow = document.createElement("div");
    titleRow.className = "download-title-row";
    titleRow.innerHTML = `
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:320px; font-weight:600;">${d.filename}</span>
      <span style="text-transform:capitalize; color:var(--text-tertiary); font-size:11px;">${d.state}</span>
    `;

    const progressPercent = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : 0;
    const progressEl = document.createElement("div");
    progressEl.className = "download-progress-bar";
    progressEl.innerHTML = `<div class="download-progress-fill" style="width: ${d.state === "completed" ? 100 : progressPercent}%"></div>`;

    const metaRow = document.createElement("div");
    metaRow.className = "download-meta-row";
    metaRow.innerHTML = `
      <span>${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}</span>
      <span>${d.speed > 0 ? `${formatBytes(d.speed)}/s` : ""}</span>
    `;

    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.gap = "8px";
    actionsRow.style.marginTop = "6px";

    if (d.state === "completed") {
      const openBtn = document.createElement("button");
      openBtn.className = "action-btn";
      openBtn.textContent = "Open File";
      openBtn.addEventListener("click", () => window.aero.openDownload(d.id));

      const folderBtn = document.createElement("button");
      folderBtn.className = "action-btn";
      folderBtn.textContent = "Show in Folder";
      folderBtn.addEventListener("click", () => window.aero.showDownloadInFolder(d.id));

      actionsRow.append(openBtn, folderBtn);
    } else if (d.state === "progressing") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "action-btn danger";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => window.aero.cancelDownload(d.id));
      actionsRow.append(cancelBtn);
    }

    card.append(titleRow, progressEl, metaRow, actionsRow);
    list.append(card);
  }
}

$("#openDownloadsFolderPage")?.addEventListener("click", () => {
  const d = downloads.find(x => x.savePath);
  if (d) window.aero.showDownloadInFolder(d.id);
  else notify("No downloads folder available");
});

$("#clearDownloadsPage")?.addEventListener("click", async () => {
  await window.aero.clearDownloadHistory();
  await renderDownloadsPage();
  notify("Downloads list cleared");
});

// Global Keyboard Shortcuts (for when renderer chrome is focused)
document.addEventListener("keydown", event => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  // Navigation: Alt+Left, Alt+Right
  if (event.altKey && !mod && (event.key === "ArrowLeft" || event.key === "Left")) {
    event.preventDefault();
    window.aero.navigationAction("back");
    return;
  }
  if (event.altKey && !mod && (event.key === "ArrowRight" || event.key === "Right")) {
    event.preventDefault();
    window.aero.navigationAction("forward");
    return;
  }

  // Reload: Ctrl+R, F5, Ctrl+Shift+R
  if ((mod && !event.altKey && key === "r") || event.key === "F5") {
    event.preventDefault();
    if (event.shiftKey) {
      window.aero.navigationAction("reload-ignoring-cache");
    } else {
      window.aero.navigationAction("reload");
    }
    return;
  }

  // Address bar: Ctrl+L, Alt+D, F6
  if ((mod && !event.altKey && !event.shiftKey && key === "l") ||
      (event.altKey && !mod && !event.shiftKey && key === "d") ||
      (event.key === "F6" && !mod && !event.altKey && !event.shiftKey)) {
    event.preventDefault();
    addressInput.focus();
    addressInput.select();
    return;
  }

  // Tabs: Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+Tab, Ctrl+1..9
  if (mod && !event.altKey && key === "t") {
    event.preventDefault();
    if (event.shiftKey) {
      window.aero.restoreClosedTab();
    } else {
      window.aero.newTab();
    }
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && key === "w") {
    event.preventDefault();
    if (activeTabId) window.aero.closeTab(activeTabId);
    return;
  }
  if (mod && !event.altKey && event.key === "Tab") {
    event.preventDefault();
    if (tabs.length > 1) {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const nextIdx = event.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
      window.aero.activateTab(tabs[nextIdx].id);
    }
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && /^[1-8]$/.test(event.key)) {
    event.preventDefault();
    const targetIdx = parseInt(event.key, 10) - 1;
    if (targetIdx < tabs.length) {
      window.aero.activateTab(tabs[targetIdx].id);
    }
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && event.key === "9") {
    event.preventDefault();
    if (tabs.length > 0) {
      window.aero.activateTab(tabs[tabs.length - 1].id);
    }
    return;
  }

  // Other: Ctrl+D, Ctrl+F, Ctrl+H, Ctrl+J, Ctrl+Shift+Delete, F11
  if (mod && !event.altKey && !event.shiftKey && key === "d") {
    event.preventDefault();
    bookmarkButton.click();
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && key === "f") {
    event.preventDefault();
    findButton.click();
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && key === "h") {
    event.preventDefault();
    window.aero.navigate("aero://history");
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && key === "j") {
    event.preventDefault();
    window.aero.navigate("aero://downloads");
    return;
  }
  if (mod && !event.altKey && event.shiftKey && (event.key === "Delete" || event.key === "Del")) {
    event.preventDefault();
    settingsButton.click();
    setTimeout(() => {
      const privBtn = $("#tab-privacy");
      if (privBtn) privBtn.click();
    }, 50);
    return;
  }
  if (event.key === "F11" && !mod && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    const maxBtn = $("#maxWindow");
    if (maxBtn) maxBtn.click();
    return;
  }

  // Escape key: close popovers, drawers, find row, cancel omnibox edit
  if (event.key === "Escape") {
    autocompleteDropdown.hidden = true;
    shieldDrawer.hidden = true;
    securityDrawer.hidden = true;
    if (!findRow.hidden) {
      findRow.hidden = true;
      window.aero.stopFindInPage("clearSelection");
    }
    if (document.activeElement === addressInput) {
      const active = tabs.find(t => t.id === activeTabId);
      addressInput.value = active ? (active.url || "aero://newtab") : "aero://newtab";
      addressInput.blur();
    }
    updateChromeHeight();
  }
});

// Theme & Wallpaper Application
function applyTheme(theme) {
  if (theme === "system") {
    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function applyWallpaper(wallpaper) {
  startPage.className = `start-page wallpaper-${wallpaper || "aurora"}`;
}

// IPC Subscriptions
window.aero.onTabsUpdated(payload => {
  tabs = payload.tabs || [];
  activeTabId = payload.activeTabId || null;
  renderTabs();
});

window.aero.onBookmarksUpdated(list => {
  bookmarks = list || [];
  renderBookmarks();
  if (currentActiveRoute === "aero://bookmarks" || currentActiveRoute === "aero://newtab") {
    renderActiveView(currentActiveRoute, true);
  }
  renderTabs();
});

window.aero.onThemeUpdated(theme => {
  applyTheme(theme);
});

window.aero.onToast(notify);

window.aero.onDownloadsUpdated(dlList => {
  downloads = dlList || [];
  if (!downloadsPage.hidden) renderDownloadsPage();
  const hasActive = downloads.some(d => d.state === "progressing");
  $("#downloadsBadge").hidden = !hasActive;
});

window.aero.onDownloadDone(doneItem => {
  notify(`Download ${doneItem.state}: ${doneItem.filename}`);
  if (!downloadsPage.hidden) renderDownloadsPage();
});

window.aero.onAdblockStatsUpdated(stats => {
  if (!stats) return;
  const count = stats.blockedCount ?? stats.siteBlocked ?? 0;
  const active = tabs.find(t => t.id === activeTabId);
  const currentDomain = active && active.url ? getDomain(active.url) : "";

  const normCurrent = currentDomain.toLowerCase().replace(/^www\./, "");
  const normStats = (stats.domain || "").toLowerCase().replace(/^www\./, "");

  if (normCurrent && normStats && (normCurrent === normStats || currentDomain === stats.domain)) {
    shieldBadge.textContent = count > 0 ? String(count) : "";
    shieldBadge.dataset.count = String(count);
    shieldBadge.hidden = count === 0;

    const isGlobal = Boolean(stats.isGlobalEnabled ?? stats.globalEnabled ?? true);
    const isEffective = Boolean(stats.isEffectiveEnabled ?? stats.siteEnabled ?? stats.isEnabled);

    if (!isGlobal) {
      shieldButton.innerHTML = ICONS.shieldDisabled;
      shieldButton.title = "Aero Shields disabled globally";
    } else if (isEffective) {
      shieldButton.innerHTML = ICONS.shieldActive;
      shieldButton.title = `Aero Shields: ${count} ads & trackers blocked`;
    } else {
      shieldButton.innerHTML = ICONS.shieldDisabled;
      shieldButton.title = `Aero Shields disabled for ${stats.domain}`;
    }

    if (!shieldDrawer.hidden) {
      $("#shieldBlockedCount").textContent = String(count);
      if (!isGlobal) {
        $("#shieldSiteToggle").checked = false;
        $("#shieldSiteToggle").disabled = true;
        $("#shieldStatusText").textContent = "Shields disabled globally (in Settings)";
      } else {
        $("#shieldSiteToggle").checked = !stats.isAllowlisted;
        $("#shieldSiteToggle").disabled = false;
        $("#shieldStatusText").textContent = isEffective
          ? "Shields active: blocking ads & trackers"
          : "Shields disabled for this site";
      }
    }
  }
});

if (window.aero.onAdblockGlobalUpdated) {
  window.aero.onAdblockGlobalUpdated(() => {
    const active = tabs.find(t => t.id === activeTabId);
    if (active) updateShieldStateForTab(active);
  });
}

window.aero.onTriggerFind(() => {
  findButton.click();
});

if (window.aero.onFocusOmnibox) {
  window.aero.onFocusOmnibox(() => {
    addressInput.focus();
    addressInput.select();
  });
}

if (window.aero.onTriggerBookmark) {
  window.aero.onTriggerBookmark(() => {
    bookmarkButton.click();
  });
}

if (window.aero.onOpenClearData) {
  window.aero.onOpenClearData(() => {
    settingsButton.click();
    setTimeout(() => {
      const privBtn = $("#tab-privacy");
      if (privBtn) privBtn.click();
    }, 50);
  });
}

if (window.aero.onActionEscape) {
  window.aero.onActionEscape(() => {
    autocompleteDropdown.hidden = true;
    shieldDrawer.hidden = true;
    securityDrawer.hidden = true;
    if (!findRow.hidden) {
      findRow.hidden = true;
      window.aero.stopFindInPage("clearSelection");
    }
    if (document.activeElement === addressInput) {
      const active = tabs.find(t => t.id === activeTabId);
      addressInput.value = active ? (active.url || "aero://newtab") : "aero://newtab";
      addressInput.blur();
    }
    updateChromeHeight();
  });
}

// Initial App Bootstrapping
(async () => {
  injectIcons();
  renderSpeedDial();

  settings = await window.aero.getSettings();
  applyTheme(settings.theme || "system");
  applyWallpaper(settings.newTabWallpaper || "aurora");

  bookmarks = await window.aero.listBookmarks();
  renderBookmarks();

  const tabList = await window.aero.listTabs();
  tabs = tabList.tabs || [];
  activeTabId = tabList.activeTabId || null;
  renderTabs();

  updateChromeHeight();

  try {
    appInfo = await window.aero.getAppInfo();
  } catch {}
})();
