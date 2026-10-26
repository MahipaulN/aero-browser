const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const INTERNAL_PREFIX = "aero://";

const SEARCH_ENGINES = {
  google: {
    name: "Google",
    searchUrl: "https://www.google.com/search?q=%s",
    suggestUrl: "https://suggestqueries.google.com/complete/search?client=chrome&q=%s"
  },
  duckduckgo: {
    name: "DuckDuckGo",
    searchUrl: "https://duckduckgo.com/?q=%s",
    suggestUrl: "https://duckduckgo.com/ac/?q=%s&type=list"
  },
  bing: {
    name: "Bing",
    searchUrl: "https://www.bing.com/search?q=%s",
    suggestUrl: "https://api.bing.com/osjson.aspx?query=%s"
  },
  brave: {
    name: "Brave",
    searchUrl: "https://search.brave.com/search?q=%s",
    suggestUrl: "https://search.brave.com/api/suggest?q=%s"
  },
  ecosia: {
    name: "Ecosia",
    searchUrl: "https://www.ecosia.org/search?q=%s",
    suggestUrl: "https://ac.ecosia.org/autocomplete?q=%s&type=list"
  }
};

/**
 * Checks whether an input string looks like a domain name with a TLD or localhost/IP.
 */
function looksLikeDomain(input) {
  const trimmed = input.trim();
  if (trimmed.includes(" ") || trimmed.startsWith("?") || trimmed.startsWith("!")) {
    return false;
  }
  // Check localhost or IP address with optional port/path
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)) return true;
  // Check typical domain pattern with TLD: example.com, sub.example.co.uk/path
  if (/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Normalizes input from the address bar to a navigable URL or search engine query.
 */
function normalizeUrl(input, searchEngine = "google") {
  const raw = String(input || "").trim();
  if (!raw || raw === "aero://newtab") {
    return "aero://newtab";
  }

  // Handle internal aero:// routes
  if (raw.startsWith(INTERNAL_PREFIX)) {
    const route = raw.slice(INTERNAL_PREFIX.length).toLowerCase().split("/")[0];
    const validRoutes = ["newtab", "settings", "history", "bookmarks", "downloads"];
    return validRoutes.includes(route) ? `aero://${route}` : "aero://newtab";
  }

  // If scheme is already present
  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      if (ALLOWED_SCHEMES.has(parsed.protocol)) {
        return parsed.href;
      }
    } catch {
      // Fall through to search query
    }
  } else if (looksLikeDomain(raw)) {
    try {
      const parsed = new URL(`https://${raw}`);
      if (ALLOWED_SCHEMES.has(parsed.protocol)) {
        return parsed.href;
      }
    } catch {
      // Fall through to search query
    }
  }

  // Default to search engine
  const engine = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
  return engine.searchUrl.replace("%s", encodeURIComponent(raw));
}

function isAllowedWebUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ALLOWED_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

function isInternalUrl(value) {
  return typeof value === "string" && value.startsWith(INTERNAL_PREFIX);
}

function isSecureUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function getOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "unknown";
  }
}

function normalizeHostname(value) {
  if (!value || typeof value !== "string") return "";
  let trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  // Reject internal routes
  if (
    trimmed.startsWith(INTERNAL_PREFIX) ||
    trimmed.startsWith("devtools://") ||
    trimmed.startsWith("chrome://") ||
    trimmed.startsWith("chrome-extension://") ||
    trimmed.startsWith("about:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return "";
  }

  // If contains scheme, parse directly with URL
  if (trimmed.includes("://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname.replace(/\.+$/, "");
    } catch {
      return "";
    }
  }

  // Remove path, query, and fragment if present without scheme
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx >= 0) trimmed = trimmed.slice(0, slashIdx);
  const qIdx = trimmed.indexOf("?");
  if (qIdx >= 0) trimmed = trimmed.slice(0, qIdx);
  const hIdx = trimmed.indexOf("#");
  if (hIdx >= 0) trimmed = trimmed.slice(0, hIdx);

  // If input has credentials (user:pass@host)
  const atIdx = trimmed.indexOf("@");
  if (atIdx >= 0) trimmed = trimmed.slice(atIdx + 1);

  // Strip IPv6 brackets or port numbers
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    const closing = trimmed.indexOf("]");
    return trimmed.slice(1, closing);
  }
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx >= 0) {
    trimmed = trimmed.slice(0, colonIdx);
  }

  // Strip trailing dot
  trimmed = trimmed.replace(/\.+$/, "");

  // Basic host characters validation
  if (/^[a-z0-9.-]+$/.test(trimmed) && !trimmed.startsWith(".") && !trimmed.endsWith(".")) {
    return trimmed;
  }
  return "";
}

function getHostname(value) {
  return normalizeHostname(value);
}

module.exports = {
  SEARCH_ENGINES,
  ALLOWED_SCHEMES,
  INTERNAL_PREFIX,
  normalizeUrl,
  isAllowedWebUrl,
  isInternalUrl,
  isSecureUrl,
  getOrigin,
  getHostname,
  normalizeHostname,
  looksLikeDomain
};
