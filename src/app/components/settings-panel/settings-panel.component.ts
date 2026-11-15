import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SpoolmateService } from '../../services/spoolmate.service';
import { formatEur } from '../../utils/material.utils';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-panel.component.html'
})
export class SettingsPanelComponent implements OnInit {
  printerName = '';
  electricityPricePerKwh = 0.35;
  printerPowerKwh = 0.12;

  exampleDurations = [
    { label: '1 Stunde', hours: 1 },
    { label: '3 Stunden', hours: 3 },
    { label: '6 Stunden', hours: 6 },
    { label: '12 Stunden', hours: 12 },
    { label: '24 Stunden (1 Tag)', hours: 24 }
  ];

  formatEur = formatEur;

  constructor(public spoolmate: SpoolmateService) {}

  ngOnInit(): void {
    const s = this.spoolmate.settings;
    this.printerName = s.printer_name || '';
    this.electricityPricePerKwh = s.electricity_price_per_kwh ?? 0.35;
    this.printerPowerKwh = s.printer_power_kwh ?? 0.12;
  }

  get currentWatts(): number {
    return Math.round((Number(this.printerPowerKwh) || 0) * 1000);
  }

  get costPerHour(): number {
    return (Number(this.electricityPricePerKwh) || 0) * (Number(this.printerPowerKwh) || 0);
  }

  get previewWattsSub(): string {
    const pwr = (Number(this.printerPowerKwh) || 0).toLocaleString('de-DE', {
      maximumFractionDigits: 3
    });
    return `${pwr} kWh × ${formatEur(this.electricityPricePerKwh)}/kWh`;
  }

  setElecPriceChip(price: number): void {
    this.electricityPricePerKwh = price;
  }

  setPowerChip(kwh: number): void {
    this.printerPowerKwh = kwh;
  }

  async saveSettings(): Promise<void> {
    try {
      await this.spoolmate.updateSettings({
        printer_name: this.printerName.trim(),
        electricity_price_per_kwh: Number(this.electricityPricePerKwh),
        printer_power_kwh: Number(this.printerPowerKwh)
      });
      this.spoolmate.showToast('Strom- & Druckereinstellungen gespeichert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }
}
