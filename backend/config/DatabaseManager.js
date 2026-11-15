const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/**
 * DatabaseManager — Verwaltet die SQLite-Datenbankverbindung, Schema-Migrationen
 * und das initiale Seeding für Hersteller, Beispiel-Spulen und Einstellungen.
 */
class DatabaseManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filesDir = path.join(dataDir, 'files');
    this.dbPath = path.join(dataDir, 'filaments.db');

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.filesDir)) {
      fs.mkdirSync(this.filesDir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initializeSchema();
    this.runMigrations();
    this.seedDefaults();
  }

  getConnection() {
    return this.db;
  }

  getFilesDir() {
    return this.filesDir;
  }

  initializeSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS manufacturers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        country TEXT DEFAULT '',
        empty_spool_weight_g INTEGER DEFAULT 200,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS filaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manufacturer_id INTEGER NOT NULL,
        material TEXT NOT NULL DEFAULT 'PLA',
        series TEXT DEFAULT '',
        color_name TEXT NOT NULL,
        color_hex TEXT NOT NULL DEFAULT '#FF5F1F',
        purchase_price REAL NOT NULL,
        initial_weight_g REAL NOT NULL,
        price_per_kg REAL NOT NULL,
        remaining_weight_g REAL NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        notes TEXT DEFAULT '',
        print_time TEXT DEFAULT '',
        image_data TEXT DEFAULT '',
        threemf_filename TEXT DEFAULT '',
        threemf_stored_name TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS project_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        filament_id INTEGER,
        label TEXT DEFAULT '',
        weight_g REAL NOT NULL,
        snapshot_name TEXT DEFAULT '',
        snapshot_material TEXT DEFAULT '',
        snapshot_color_hex TEXT DEFAULT '#FF5F1F',
        snapshot_price_per_kg REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  runMigrations() {
    const projCols = this.db.prepare('PRAGMA table_info(projects)').all();
    if (!projCols.some(c => c.name === 'image_data')) {
      this.db.exec("ALTER TABLE projects ADD COLUMN image_data TEXT DEFAULT ''");
    }
    if (!projCols.some(c => c.name === 'print_time')) {
      this.db.exec("ALTER TABLE projects ADD COLUMN print_time TEXT DEFAULT ''");
    }
    if (!projCols.some(c => c.name === 'threemf_filename')) {
      this.db.exec("ALTER TABLE projects ADD COLUMN threemf_filename TEXT DEFAULT ''");
    }
    if (!projCols.some(c => c.name === 'threemf_stored_name')) {
      this.db.exec("ALTER TABLE projects ADD COLUMN threemf_stored_name TEXT DEFAULT ''");
    }

    const itemCols = this.db.prepare('PRAGMA table_info(project_items)').all();
    if (!itemCols.some(c => c.name === 'snapshot_material')) {
      this.db.exec("ALTER TABLE project_items ADD COLUMN snapshot_material TEXT DEFAULT ''");
      this.db.exec(`
        UPDATE project_items
        SET snapshot_material = COALESCE(
          (SELECT f.material FROM filaments f WHERE f.id = project_items.filament_id),
          ''
        )
      `);
    }
  }

  seedDefaults() {
    const insertSetting = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('electricity_price_per_kwh', '0.35');
    insertSetting.run('printer_power_kwh', '0.12');
    insertSetting.run('printer_name', '');

    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM manufacturers').get();
    if (countRow.count === 0) {
      const defaultManufacturers = [
        { name: 'Bambu Lab', country: 'CN', weight: 250 },
        { name: 'Prusament (Prusa)', country: 'CZ', weight: 200 },
        { name: 'eSUN', country: 'CN', weight: 220 },
        { name: 'SUNLU', country: 'CN', weight: 195 },
        { name: 'Polymaker', country: 'CN/US', weight: 140 },
        { name: 'Extrudr', country: 'AT', weight: 230 },
        { name: 'Das Filament', country: 'DE', weight: 210 },
        { name: 'Eryone', country: 'CN', weight: 200 },
        { name: 'Elegoo', country: 'CN', weight: 160 },
        { name: 'Overture', country: 'US/CN', weight: 185 },
        { name: 'Creality', country: 'CN', weight: 190 },
        { name: 'Anycubic', country: 'CN', weight: 190 },
        { name: 'Redline Filament', country: 'NL/DE', weight: 220 },
        { name: 'FormFutura', country: 'NL', weight: 210 },
        { name: 'Geeetech', country: 'CN', weight: 200 },
        { name: 'Fiberlogy', country: 'PL', weight: 240 }
      ];

      const insertMfg = this.db.prepare(
        'INSERT INTO manufacturers (name, country, empty_spool_weight_g) VALUES (?, ?, ?)'
      );
      for (const m of defaultManufacturers) {
        insertMfg.run(m.name, m.country, m.weight);
      }
    }
  }
}

module.exports = { DatabaseManager };
