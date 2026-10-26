# Aero Browser

A production-quality Chromium desktop browser for Windows 10/11 inspired by the visual language of macOS Sonoma and Sequoia. Built with Electron 35, modern `WebContentsView` architecture, and frosted-glass aesthetics.

---

## Key Highlights

- **Real Web Rendering via WebContentsView**: Fully migrated from deprecated `BrowserView` to Electron's modern `WebContentsView` API with centralized view ownership and responsive content bounds.
- **macOS Sonoma / Sequoia Frosted Glass Chrome**:
  - Translucent surfaces with high-performance backdrop blur (`backdrop-filter: blur(28px) saturate(180%)`).
  - Interactive traffic light controls (close, minimize, maximize) with subtle symbol fade on hover.
  - Native Windows window dragging via `-webkit-app-region: drag` and non-draggable interactive areas.
  - Adaptive light, dark, and system themes with harmonious contrast.
- **Polished Tab Strip**:
  - Multi-tab browsing with smooth drag-and-drop reordering.
  - Middle-click to close tabs.
  - Favicon support with real site favicons, fallback globe icon, and loading spinner animation.
  - Tab pinning (favicon-only compact tabs).
  - Tab duplication and closed-tab restoration (`Ctrl+Shift+T`).
  - Tab navigation shortcuts (`Ctrl+Tab` and `Ctrl+Shift+Tab`).
- **Omnibox (Address & Search Bar)**:
  - Smart URL recognition with automatic HTTPS pre-pending for common domains.
  - Configurable default search engines: Google, DuckDuckGo, Bing, Brave, and Ecosia.
  - Autocomplete dropdown suggesting bookmarks, history items, and search queries.
  - Security indicator badge: Verified TLS/HTTPS lock icon and HTTP insecure warnings, with an interactive connection details popover.
  - Animated loading progress bar.
  - Single-click bookmark star toggle (`☆`/`★`) with toast notifications.
- **Start Page (New Tab Canvas)**:
  - Dynamic frosted wallpaper themes: Aurora, Sunset, Pacific Ocean, and Graphite Minimal.
  - Live clock and greeting.
  - Centered omnibox search widget with engine selector.
  - Interactive speed dial shortcuts grid with hover micro-animations.
- **Find in Page**:
  - Floating search bar triggered by `Ctrl+F` or toolbar button.
  - Real-time match counter (`1 of 5`), Next/Previous match navigation, and Escape to dismiss.
- **Download Manager**:
  - Live download tracking: filename, transfer speed (KB/s, MB/s), received/total bytes, progress bar, and status.
  - Pause, resume, and cancel active transfers.
  - "Show in Folder" (Windows File Explorer) and direct file opening.
  - Optional "Ask where to save each file" setting.
- **Session & Profile Isolation**:
  - Persistent user profiles with independent cookies, cache, localStorage, and metadata.
  - Ephemeral private browsing partition (`aero-private-<timestamp>`) with zero persistent disk storage.
  - Data cleanup tools for clearing cookies, cache, and browsing history.
- **Security & Website Permissions**:
  - Context isolation enabled, Node.js integration disabled for renderers, strict sandboxing.
  - Strict Content Security Policy on chrome renderer.
  - Website permissions denied by default.
  - Origin-based permission decisions (`geolocation`, `notifications`, `media`, etc.).
- **Aero Shields (Real Network-Level Ad & Tracker Blocker)**:
  - Network-level request interception powered by `@ghostery/adblocker-electron` using maintained lists (EasyList, EasyPrivacy, Peter Lowe's) and offline fallback rules.
  - Per-site allowlisting toggle with real-time stats and persistent preferences.
  - Global blocking toggle in Settings (`aero://settings`).
  - Toolbar shield button with live blocked-request badge and slide-out `#shieldDrawer`.
- **Windows Packaging & NSIS Installer**:
  - Electron Builder configured with NSIS target for Windows x64.
  - Desktop and Start Menu shortcut generation.
  - Selectable installation directory and clean uninstaller.
  - Original geometric aerodynamic "A" multi-resolution Windows application icon (`build/icon.ico`).

For a detailed history of all architectural fixes and bug repairs, see [CHANGELOG.md](file:///c:/Users/mahip/Downloads/Aero-Browser-Windows-Installer-Project/aero-browser/CHANGELOG.md).

---

## Requirements

- Windows 10 or Windows 11 (64-bit)
- Node.js 20.18+ (tested with Node v24.15 LTS)
- npm 10+ (included with Node.js)

---

## Development & Testing

### 1. Run in Development Mode
```powershell
npm start
```

### 2. Run Linting (ESLint 9 Flat Config)
```powershell
npm run lint
```

### 3. Run Automated Tests
```powershell
npm test
```
*Executes unit and integration tests covering URL parsing, search engines, IPC validation, store persistence, permission tracking, download states, and profile isolation.*

---

## Building the Windows Installer

### Build the Full NSIS Installer
```powershell
npm run dist
```
The installer executable will be written to:
`release/Aero-Browser-Setup-0.1.0-x64.exe`

### Build Unpacked Directory
```powershell
npm run pack
```
Generates the unpacked standalone Windows application at:
`release/win-unpacked/Aero Browser.exe`

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+T` | Open new tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Shift+T` | Restore recently closed tab |
| `Ctrl+Tab` | Switch to next tab |
| `Ctrl+Shift+Tab` | Switch to previous tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+R` | Reload current page |
| `Ctrl+D` | Bookmark current page |
| `Ctrl+F` | Find in page |
| `Ctrl+H` | Open browsing history |
| `Ctrl+J` | Open downloads panel |
| `Alt+Left` | Navigate back |
| `Alt+Right` | Navigate forward |
| `Escape` | Dismiss active panel, find bar, or revert address bar |
