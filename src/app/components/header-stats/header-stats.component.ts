import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpoolmateService } from '../../services/spoolmate.service';
import { formatEur, formatGrams } from '../../utils/material.utils';

@Component({
  selector: 'app-header-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header-stats.component.html'
})
export class HeaderStatsComponent {
  @Output() addSpoolClicked = new EventEmitter<void>();

  constructor(public spoolmate: SpoolmateService) {}

  get totalSpools(): number {
    return this.spoolmate.filaments.length;
  }

  get lowStockCount(): number {
    return this.spoolmate.filaments.filter((f) => f.remaining_weight_g < 200).length;
  }

  get totalRemainingG(): number {
    return this.spoolmate.filaments.reduce(
      (sum, f) => sum + Number(f.remaining_weight_g || 0),
      0
    );
  }

  get totalInitialG(): number {
    return this.spoolmate.filaments.reduce(
      (sum, f) => sum + Number(f.initial_weight_g || 0),
      0
    );
  }

  get remainingStockFormatted(): string {
    const g = this.totalRemainingG;
    return g >= 1000
      ? `${(g / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`
      : formatGrams(g);
  }

  get totalInitialFormatted(): string {
    return `von ${(this.totalInitialG / 1000).toLocaleString('de-DE', {
      maximumFractionDigits: 2
    })} kg Gesamtvolumen`;
  }

  get totalPurchaseValueFormatted(): string {
    const val = this.spoolmate.filaments.reduce(
      (sum, f) => sum + Number(f.purchase_price || 0),
      0
    );
    return formatEur(val);
  }

  get totalRemainingValueFormatted(): string {
    const val = this.spoolmate.filaments.reduce(
      (sum, f) =>
        sum + (Number(f.remaining_weight_g || 0) / 1000) * Number(f.price_per_kg || 0),
      0
    );
    return formatEur(val);
  }

  get avgKgFormatted(): string {
    const list = this.spoolmate.filaments;
    const avg =
      list.length > 0
        ? list.reduce((sum, f) => sum + Number(f.price_per_kg || 0), 0) / list.length
        : 0;
    return `${formatEur(avg)}/kg`;
  }
}
