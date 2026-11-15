/**
 * SettingsService — Geschäftslogik (@Service) für Strompreis- und Druckereinstellungen.
 */
class SettingsService {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  getSettings() {
    const s = this.settingsRepo.getSettings();
    return {
      ...s,
      electricity_price_kwh: s.electricity_price_per_kwh,
      printer_power_kw: s.printer_power_kwh
    };
  }

  updateSettings(payload) {
    const electricityPricePerKwh = Number(
      payload.electricity_price_per_kwh !== undefined
        ? payload.electricity_price_per_kwh
        : payload.electricity_price_kwh
    );
    const printerPowerKwh = Number(
      payload.printer_power_kwh !== undefined
        ? payload.printer_power_kwh
        : payload.printer_power_kw
    );
    const printerName = String(payload.printer_name || '').trim();

    if (!Number.isFinite(electricityPricePerKwh) || electricityPricePerKwh < 0) {
      const err = new Error('Bitte einen gültigen Strompreis (€/kWh) eingeben.');
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(printerPowerKwh) || printerPowerKwh < 0) {
      const err = new Error('Bitte einen gültigen Stromverbrauch (kWh) eingeben.');
      err.statusCode = 400;
      throw err;
    }

    const saved = this.settingsRepo.saveSettings({
      electricityPricePerKwh,
      printerPowerKwh,
      printerName
    });
    return {
      ...saved,
      electricity_price_kwh: saved.electricity_price_per_kwh,
      printer_power_kw: saved.printer_power_kwh
    };
  }
}

module.exports = { SettingsService };
