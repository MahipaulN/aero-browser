# Aero Browser — Changelog & Implementation History

## Summary of Changes (UI-First Repair & Polish)

This document provides a comprehensive log of all architectural improvements, bug fixes, UI enhancements, icon design assets, and security features implemented in Aero Browser.

---

### 1. Priority 1: Core UI & Architecture Repairs

#### A. Root Cause Diagnosis & Repair of Blank `aero://newtab` Landing Page
- **Root Cause**:
  1. In `src/main/tab-manager.js`, `createTab` sanitized `"aero://newtab"` by converting it to an empty string (`tab.url = ""`), while `navigate` set `tab.url = ""` for any internal URL.
  2. `tabSummary` sent `{ url: tab.url || "aero://newtab" }` to the renderer.
  3. In `src/renderer/renderer.js`, line 235 previously executed `startPage.hidden = Boolean(active.url);`. Because `active.url` evaluated to `"aero://newtab"`, `Boolean("aero://newtab")` evaluated to `true`, causing the start page to be hidden.
  4. At the same time, `isAllowedWebUrl("aero://newtab")` evaluated to `false`, which caused `tabManager.layoutActiveView` to detach or hide the Chromium `WebContentsView`. Both the web view and the HTML start page were hidden simultaneously, rendering a completely blank canvas.
- **Fix Applied**:
  - `tab.url` now retains explicit internal URIs (`aero://newtab`, `aero://settings`, `aero://history`, `aero://bookmarks`, `aero://downloads`).
  - Implemented an internal page router in `renderer.js` (`renderActiveView`) that selectively displays `#startPage` whenever the active tab has no web URL or is set to `"aero://newtab"`.
  - Rebuilt the start page canvas with:
    - Aero brand mark and tagline.
    - Live local clock and contextual greeting ("Good morning", "Good afternoon", "Good evening").
    - Web search bar tied to the default search engine with direct URL navigation support.
    - Speed dial shortcuts grid (Google, YouTube, GitHub, Wikipedia, Reddit, DuckDuckGo).
    - Quick favorites bar populated directly from saved bookmarks.

#### B. Header Controls & Overlay Visibility Bug Fix
- **Root Cause**:
  - In Electron, `WebContentsView` is an OS-level child view attached to `mainWindow.contentView`. It always renders on top of the renderer window's HTML layer.
  - Floating HTML popovers and panels positioned below `y: 88px` (History, Downloads, Menus, Modals) were being drawn behind active websites, making them invisible or unresponsive when browsing live web pages.
- **Fix Applied**:
  1. **First-Class Internal Tab Pages**: Moved full views (Settings, History, Bookmarks, Downloads) into dedicated full-page components rendered in `#pageArea` (`aero://settings`, `aero://history`, `aero://bookmarks`, `aero://downloads`). When navigating to an internal page, `WebContentsView` is safely detached from the view hierarchy, eliminating z-order stacking conflicts.
  2. **Header Drawers with Dynamic Bounds Synchronization**: Integrated quick panels directly into `#chromeHeader`:
     - `#findRow`: Find in Page bar (`Ctrl+F`).
     - `#shieldDrawer`: Aero Shields ad/tracker control drawer.
     - `#securityDrawer`: HTTPS/TLS connection details drawer.
     - Bookmarks bar (`Ctrl+Shift+B`).
     - Opening or closing any drawer calls `updateChromeHeight()`, notifying the main process via `window.aero.setChromeHeight(height)` to dynamically adjust `WebContentsView` bounds so web content is never clipped or overlaid.
  3. **Native Context & App Menus**: Main menu (`•••`) and tab right-click context menus now invoke native OS menus (`Menu.buildFromTemplate().popup({ window: mainWindow })`), guaranteeing they always appear above web content.

---

### 2. Priority 2: macOS-Inspired Windows UI & Styling Polish

- **Frosted Glass Styling**: Applied translucent glass styling (`backdrop-filter: blur(28px) saturate(180%)`) exclusively to the browser chrome header (`.chrome`), eliminating whole-page blurring artifacts and muddy backgrounds.
- **Traffic Light Controls**: macOS-style circular window buttons (close, minimize, maximize) with subtle symbol fade on hover and active click feedback.
- **Rounded Tabs & Omnibox**: Tabs styled with smooth rounded corners (`border-radius: 9px 9px 4px 4px`), loading spinner, favicon support, and dragging state. Address bar features subtle inset highlights and border focus glow.
- **Crisp Vector SVGs**: Replaced emojis and placeholder glyphs with custom SVG icons in `src/renderer/icons.js` (back, forward, reload, stop, home, lock, lockWarning, search, starEmpty, starFilled, downloads, history, bookmarks, settings, user, plus, close, menu, pin, globe, shield, shieldActive, shieldDisabled, trash, folder, find, chevronUp, chevronDown).
- **Controls & Switches**: Added iOS/macOS styled slider toggles (`.switch-toggle`) for settings and shields.
- **Adaptive Dark / Light Themes**: Support for Windows system default theme, light mode, and dark mode, with dynamic wallpaper motifs (Aurora Glass, Sunset Haze, Pacific Ocean, Graphite Minimal).

---

### 3. Priority 3: New Original Aero Application Icon

- **Design**: Created an original aerodynamic geometric "A" motif featuring subtle depth, inner glow, and restrained gradient against an obsidian slate squircle.
- **Icon Generation Utility**: Created `scripts/generate-icons.ps1` using .NET `System.Drawing`:
  - `build/icon.ico`: Multi-resolution Windows icon embedding 6 distinct mipmap sizes (`256x256`, `128x128`, `64x64`, `48x48`, `32x32`, `16x16`).
  - `build/icon.png`: 256x256 high-resolution PNG.
  - `build/icon-master.png`: 512x512 master high-resolution asset.
  - `src/renderer/assets/icon.png`: App asset used on the start page, window chrome, and about screen.
- **Integration**: Configured in `package.json` build targets, Windows installer shortcuts, taskbar runtime, and window creation fallback in `src/main/index.js`.

---

### 4. Priority 4: Real Network-Level Ad & Tracker Blocker

- **Filtering Engine**: Integrated `@ghostery/adblocker-electron` into `src/main/adblock-manager.js`.
- **Network-Level Interception**: Requests are blocked at the session level before network transmission using EasyList, EasyPrivacy, Peter Lowe's Blocklist, and built-in offline fallback rules.
- **Per-Site Allowlisting**: Real-time allowlist toggle per hostname stored persistently in `store.js`.
- **Global Toggle**: Ability to toggle ad blocking globally via Settings (`aero://settings` > Aero Shields).
- **Toolbar Shield Controls**:
  - Shield icon on the toolbar displaying active or disabled states.
  - Live badge indicator showing the number of blocked requests on the current page.
  - Interactive `#shieldDrawer` showing site domain, status, blocked request count, and an instant toggle switch.
  - Real-time updates via `window.aero.onAdblockStatsUpdated`.

---

### 5. Priority 5: Testing, Quality & Installer Build

- **Automated Unit & Regression Tests**:
  - Added `test/adblock.test.js` testing rule parsing, matching, benign request allowance, global toggle, and per-site allowlisting.
  - Total test suite: **19 passing tests** across Download Manager, Profile Manager, Store, URL Utils, IPC Validation, and AdBlock.
- **Code Quality**:
  - Configured ESLint 9 flat configuration (`eslint.config.js`).
  - Clean lint report: **0 errors, 0 warnings**.
- **Windows Production Installer**:
  - Packaged via `electron-builder --win nsis`.
  - Output binary: `release/Aero-Browser-Setup-0.1.0-x64.exe` (92.6 MB).
  - Unpacked application: `release/win-unpacked/Aero Browser.exe`.

---

## Detailed File-by-File Change Log

| File | Type | Changes Description |
| :--- | :--- | :--- |
| `src/main/tab-manager.js` | Modified | Migrated to modern `WebContentsView`. Fixed internal URL routing, bounds synchronization with chrome height (`setChromeHeight`), tab reordering, and view attachment logic. |
| `src/main/adblock-manager.js` | Created | AdBlockManager implementation with `@ghostery/adblocker-electron`, offline fallback rules, per-site allowlist, global toggle, and live stats broadcasting. |
| `src/main/ipc-handlers.js` | Modified | Added validated IPC handlers for adblock (`adblock:getStats`, `adblock:toggleSite`, `adblock:toggleGlobal`), native popup menus (`menu:showAppMenu`, `menu:showTabMenu`), and dynamic chrome height (`nav:chromeHeight`). |
| `src/main/preload.js` | Modified | Updated frozen `window.aero` context bridge exposing adblock methods, native menu triggers, chrome height adjustments, and event subscriptions. |
| `src/main/index.js` | Modified | Integrated adblock manager initialization with electron sessions. Added robust icon path resolution supporting both dev and packaged modes. |
| `src/renderer/index.html` | Modified | Added DOM elements for header drawers (`#shieldDrawer`, `#securityDrawer`, `#findRow`), shield button (`#shieldButton`, `#shieldBadge`), and full internal pages (`#startPage`, `#settingsPage`, `#historyPage`, `#bookmarksPage`, `#downloadsPage`). |
| `src/renderer/styles.css` | Modified | Added CSS for header drawers, macOS toggle switches, shield badge, internal full-page layouts, item lists, action buttons, and refined typography. Ensured blur is restricted to chrome. |
| `src/renderer/renderer.js` | Rewritten | Complete UI controller with internal page routing (`renderActiveView`), dynamic chrome height recalculation (`updateChromeHeight`), live shield drawer controls, and event listeners. |
| `src/renderer/icons.js` | Modified | Added vector SVG icons for `shield`, `shieldActive`, and `shieldDisabled`. |
| `scripts/generate-icons.ps1` | Created | PowerShell script generating high-resolution master PNGs and multi-resolution Windows `build/icon.ico`. |
| `build/icon.ico` | Created | Multi-resolution Windows icon (256, 128, 64, 48, 32, 16 sizes). |
| `build/icon.png` | Created | 256x256 PNG application icon. |
| `src/renderer/assets/icon.png` | Created | 256x256 PNG asset used in renderer and window chrome. |
| `test/adblock.test.js` | Created | Unit test suite for ad blocker rule matching, allowlist toggle, and store persistence. |
| `package.json` | Modified | Bundled `build/icon.ico` in distribution files array. Added `@ghostery/adblocker-electron` dependency. |
| `eslint.config.js` | Created | ESLint 9 CommonJS flat configuration with globals for browser, node, and test runner. |
| `CHANGELOG.md` | Created | Comprehensive history of all modifications and technical architecture. |
