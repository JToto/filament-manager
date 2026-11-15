/**
 * SettingsRepository — Datenzugriffsschicht (DAO/Repository) für globale App-Einstellungen (`settings`).
 */
class SettingsRepository {
  constructor(db) {
    this.db = db;
  }

  getSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return {
      electricity_price_per_kwh: Number(map.electricity_price_per_kwh ?? 0.35),
      printer_power_kwh: Number(map.printer_power_kwh ?? 0.12),
      printer_name: String(map.printer_name ?? '')
    };
  }

  saveSettings({ electricityPricePerKwh, printerPowerKwh, printerName }) {
    const upsert = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    upsert.run('electricity_price_per_kwh', String(electricityPricePerKwh));
    upsert.run('printer_power_kwh', String(printerPowerKwh));
    upsert.run('printer_name', String(printerName || '').trim());
    return this.getSettings();
  }
}

module.exports = { SettingsRepository };
