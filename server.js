const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { HttpUtils } = require('./backend/utils/HttpUtils');
const { DatabaseManager } = require('./backend/config/DatabaseManager');

const { ManufacturerRepository } = require('./backend/repositories/ManufacturerRepository');
const { FilamentRepository } = require('./backend/repositories/FilamentRepository');
const { ProjectRepository } = require('./backend/repositories/ProjectRepository');
const { SettingsRepository } = require('./backend/repositories/SettingsRepository');

const { ThreeMfService } = require('./backend/services/ThreeMfService');
const { ManufacturerService } = require('./backend/services/ManufacturerService');
const { FilamentService } = require('./backend/services/FilamentService');
const { ProjectService } = require('./backend/services/ProjectService');
const { SettingsService } = require('./backend/services/SettingsService');

const { ManufacturerController } = require('./backend/controllers/ManufacturerController');
const { FilamentController } = require('./backend/controllers/FilamentController');
const { ProjectController } = require('./backend/controllers/ProjectController');
const { SettingsController } = require('./backend/controllers/SettingsController');

const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const ANGULAR_DIST_DIR = path.join(__dirname, 'dist', 'spoolmate', 'browser');
const PUBLIC_FALLBACK_DIR = path.join(__dirname, 'public');

// 1. Datenbank & Infrastruktur initialisieren
const dbManager = new DatabaseManager(DATA_DIR);
const db = dbManager.getConnection();
const filesDir = dbManager.getFilesDir();

// 2. Repositories (Datenzugriffsschicht) instanziieren
const manufacturerRepo = new ManufacturerRepository(db);
const filamentRepo = new FilamentRepository(db);
const projectRepo = new ProjectRepository(db);
const settingsRepo = new SettingsRepository(db);

// 3. Services (Geschäftslogik) instanziieren
const threeMfService = new ThreeMfService();
const manufacturerService = new ManufacturerService(manufacturerRepo);
const filamentService = new FilamentService(filamentRepo, projectRepo);
const projectService = new ProjectService(
  projectRepo,
  filamentRepo,
  settingsRepo,
  threeMfService,
  filesDir
);
const settingsService = new SettingsService(settingsRepo);

// 4. REST-Controller instanziieren
const controllers = [
  new SettingsController(settingsService, manufacturerService, filamentService, projectService),
  new ManufacturerController(manufacturerService, filamentService, projectService),
  new FilamentController(filamentService, manufacturerService, projectService),
  new ProjectController(projectService)
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

/**
 * Liefert statische Dateien aus dem gebauten Angular-Bundle (`dist/spoolmate/browser`)
 * bzw. als Fallback aus `public/`.
 */
function serveStaticFile(req, res, pathname) {
  const staticRoot = fs.existsSync(ANGULAR_DIST_DIR) ? ANGULAR_DIST_DIR : PUBLIC_FALLBACK_DIR;
  const safePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(staticRoot, safePath);

  if (!filePath.startsWith(staticRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // SPA-Fallback auf index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(staticRoot, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/api/')) {
      for (const controller of controllers) {
        const handled = await controller.handle(req, res, pathname);
        if (handled !== false) {
          return;
        }
      }
      return HttpUtils.sendJson(res, 404, { error: `API-Endpunkt nicht gefunden: ${pathname}` });
    }

    serveStaticFile(req, res, pathname);
  } catch (err) {
    console.error('[SpoolMate Server Error]', err);
    const statusCode = err.statusCode || 500;
    HttpUtils.sendJson(res, statusCode, {
      error: err.message || 'Interner Serverfehler.'
    });
  }
});

server.listen(PORT, () => {
  console.log(`\n🧵 SpoolMate Server (Angular + OOP Backend) läuft auf http://localhost:${PORT}\n`);
});
