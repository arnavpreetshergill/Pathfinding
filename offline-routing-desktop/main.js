/**
 * Entry point for the Electron main process.
 * Manages the desktop application lifecycle, window instantiation,
 * and starts a secure local static file server to host built Angular files
 * and serve local QGIS XYZ offline map tiles.
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

let mainWindow;
let localServer;
let backendProcess = null;
let dynamicBackendPort = null;

// Dev mode tracker flags
const isDev = process.argv.includes('--dev');

/**
 * Starts the Java Backend process on a dynamic port and parses stdout to discover it.
 */
function startBackend() {
  return new Promise((resolve, reject) => {
    console.log('Starting Java Backend...');
    const userDataPath = app.getPath('userData');
    
    // Determine path to backend folder (in dev it's ./backend, in prod it's inside resources)
    const isPackaged = app.isPackaged;
    const backendDir = isPackaged 
      ? path.join(process.resourcesPath, 'backend') 
      : path.join(__dirname, 'backend');
    
    const jarPath = path.join(backendDir, 'offline-router.jar');
    const tarPath = path.join(backendDir, 'jre-linux.tar.gz');
    const jreExtractDir = path.join(userDataPath, 'jre');
    const jreBinDir = path.join(jreExtractDir, 'jdk-17.0.14+7-jre', 'bin');
    
    let javaExecutable = 'java'; // fallback to system java
    
    if (process.platform === 'linux') {
      if (!fs.existsSync(jreExtractDir)) {
        console.log('First Linux run detected. Extracting bundled JRE...');
        fs.mkdirSync(jreExtractDir, { recursive: true });
        execSync(`tar -xzf "${tarPath}" -C "${jreExtractDir}"`);
      }
      javaExecutable = path.join(jreBinDir, 'java');
    }

    // Spawn the backend
    backendProcess = spawn(javaExecutable, ['-jar', jarPath]);

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Backend]: ${output.trim()}`);
      
      // Parse for: Tomcat started on port(s): 60835 (http)
      if (!dynamicBackendPort) {
        const portMatch = output.match(/Tomcat started on port(?:s)?:? (\d+)/) || output.match(/Tomcat initialized with port(?:s)?:? (\d+)/);
        if (portMatch && portMatch[1] && portMatch[1] !== '0') {
          dynamicBackendPort = parseInt(portMatch[1], 10);
          console.log(`Discovered Dynamic Backend Port: ${dynamicBackendPort}`);
          
          // Setup API interception once port is known
          setupApiInterceptor(dynamicBackendPort);
          resolve(dynamicBackendPort);
        }
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend ERR]: ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend process.', err);
      // Even if backend fails, resolve so UI can show connection errors instead of blocking completely
      resolve(8080);
    });
  });
}

function setupApiInterceptor(port) {
  // Intercept requests going to the hardcoded localhost:8080/api and route to dynamic port
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://localhost:8080/api/*'] }, (details, callback) => {
    const url = new URL(details.url);
    url.port = port;
    callback({ redirectURL: url.toString() });
  });
}

/**
 * MIME type map used by the local file server to return correct Content-Type headers
 * for Angular modules, styles, images, fonts, and spatial map tiles.
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json'
};

/**
 * Starts a local HTTP server that serves:
 *   - `/offline-map-data/*`  -->  loads tile resources from the `<project>/offline-map-data/` folder.
 *   - `/*`                   -->  loads built Angular browser static files from `<project>/dist/offline-routing-desktop/browser/`.
 *
 * Implements case-insensitive security checks on Windows to prevent path traversal vulnerability.
 *
 * @returns {Promise<number>} Resolves with the active HTTP server port.
 */
function startLocalServer() {
  const isPackaged = app.isPackaged;
  const browserDist = path.join(__dirname, 'dist', 'offline-routing-desktop', 'browser');
  const tileDir = isPackaged 
    ? path.join(process.resourcesPath, 'offline-map-data')
    : path.join(__dirname, 'offline-map-data');

  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      // Decode URL paths and remove query strings (e.g. cache busting parameter logs)
      const urlPath = decodeURIComponent(req.url.split('?')[0]);

      let filePath;
      if (urlPath.startsWith('/offline-map-data/')) {
        filePath = path.join(tileDir, urlPath.replace('/offline-map-data/', ''));
      } else {
        filePath = path.join(browserDist, urlPath === '/' ? 'index.html' : urlPath);
      }

      // Security: prevent path traversal attacks
      const normalizedPath = path.resolve(filePath);
      const isWindows = process.platform === 'win32';

      /**
       * Compares path prefix matching. Employs case-insensitive matching on Windows
       * to safeguard against drive letter case mismatch bugs (e.g. c:\ vs C:\).
       */
      const checkPath = (p, prefix) => {
        if (isWindows) {
          return p.toLowerCase().startsWith(prefix.toLowerCase());
        }
        return p.startsWith(prefix);
      };

      if (!checkPath(normalizedPath, browserDist) && !checkPath(normalizedPath, tileDir)) {
        res.writeHead(403);
        res.end();
        return;
      }

      // Read file and serve content
      fs.readFile(normalizedPath, (err, data) => {
        if (err) {
          // SPA fallback: return index.html for non-file routing paths (SPA page refresh support)
          if (err.code === 'ENOENT' && !urlPath.includes('.')) {
            fs.readFile(path.join(browserDist, 'index.html'), (err2, html) => {
              if (err2) {
                res.writeHead(404);
                res.end();
                return;
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(html);
            });
            return;
          }
          res.writeHead(404);
          res.end();
          return;
        }

        // Send correct content type headers
        const ext = path.extname(normalizedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    // Listen on a fixed port so existing browser tabs remain connected, falling back to random on collision
    const FIXED_PORT = 57629;
    localServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${FIXED_PORT} is in use, falling back to a random available port.`);
        localServer.listen(0, '127.0.0.1', () => {
          const port = localServer.address().port;
          console.log(`Local static server running on http://127.0.0.1:${port}`);
          resolve(port);
        });
      } else {
        reject(err);
      }
    });

    localServer.listen(FIXED_PORT, '127.0.0.1', () => {
      console.log(`Local static server running on http://127.0.0.1:${FIXED_PORT}`);
      resolve(FIXED_PORT);
    });
  });
}

/**
 * Instantiates the Electron BrowserWindow.
 *
 * @param {string} loadUrl Local URL target to load (loopback static port or localhost dev server).
 */
function createWindow(loadUrl) {
  mainWindow = new BrowserWindow({
    title: 'Routing App',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Strip system application dropdown menus
  mainWindow.setMenu(null);

  mainWindow.loadURL(loadUrl);

  // Auto-launch developer tools when initialized in development environment
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Lifecycle handler: ready
app.on('ready', async () => {
  // Start backend concurrently with static server
  const [port, _] = await Promise.all([
    startLocalServer(),
    startBackend()
  ]);
  
  let loadUrl;

  if (isDev) {
    // Angular dev server address
    loadUrl = 'http://localhost:4200';
  } else {
    loadUrl = `http://127.0.0.1:${port}`;
  }

  createWindow(loadUrl);
});

// Lifecycle handler: all windows closed
app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Lifecycle handler: app quit
app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// Lifecycle handler: activate (macOS task icon click support)
app.on('activate', () => {
  if (mainWindow === null) {
    const port = localServer ? localServer.address().port : 57629;
    const loadUrl = isDev ? 'http://localhost:4200' : `http://127.0.0.1:${port}`;
    createWindow(loadUrl);
  }
});