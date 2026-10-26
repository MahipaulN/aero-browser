const test = require("node:test");
const assert = require("node:assert/strict");
const downloadManager = require("../src/main/download-manager");

test("DownloadManager: tracks downloads and supports pause/resume/cancel transitions", () => {
  // Simulate active download
  let paused = false;
  let resumed = false;
  let cancelled = false;

  const mockItem = {
    getFilename: () => "installer.exe",
    getTotalBytes: () => 10485760,
    getReceivedBytes: () => 5242880,
    getURL: () => "https://example.com/installer.exe",
    getMimeType: () => "application/octet-stream",
    getSavePath: () => "C:\\Users\\test\\Downloads\\installer.exe",
    canResume: () => true,
    pause: () => { paused = true; },
    resume: () => { resumed = true; },
    cancel: () => { cancelled = true; }
  };

  const id = "dl-test-1";
  downloadManager.activeDownloads.set(id, {
    item: mockItem,
    meta: {
      id,
      filename: "installer.exe",
      savePath: "C:\\Users\\test\\Downloads\\installer.exe",
      totalBytes: 10485760,
      receivedBytes: 5242880,
      speed: 102400,
      state: "progressing",
      canResume: true,
      url: "https://example.com/installer.exe",
      mimeType: "application/octet-stream",
      startTime: Date.now(),
      endTime: null
    }
  });

  const list = downloadManager.listDownloads();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].state, "progressing");

  // Pause
  const pauseOk = downloadManager.pauseDownload(id);
  assert.equal(pauseOk, true);
  assert.equal(paused, true);
  assert.equal(downloadManager.activeDownloads.get(id).meta.state, "paused");

  // Resume
  const resumeOk = downloadManager.resumeDownload(id);
  assert.equal(resumeOk, true);
  assert.equal(resumed, true);
  assert.equal(downloadManager.activeDownloads.get(id).meta.state, "progressing");

  // Cancel
  const cancelOk = downloadManager.cancelDownload(id);
  assert.equal(cancelOk, true);
  assert.equal(cancelled, true);
  assert.equal(downloadManager.activeDownloads.get(id).meta.state, "cancelled");

  // Cleanup
  downloadManager.activeDownloads.delete(id);
});
