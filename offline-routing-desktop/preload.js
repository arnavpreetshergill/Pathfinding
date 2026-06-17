/**
 * Electron Preload Script.
 * Acts as a secure bridge between the isolated renderer process (Angular)
 * and the Node.js main process.
 * Currently, no active IPC events are required by the frontend layout.
 */

const { contextBridge } = require('electron');

// Safeguard exposure (unused but kept as placeholder for future IPC requirements)
contextBridge.exposeInMainWorld('electronAPI', {
  app: {
    quit: () => {} // Safe placeholder
  }
});
