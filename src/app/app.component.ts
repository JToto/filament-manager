import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Filament, TabType } from './models/spoolmate.models';
import { SpoolmateService } from './services/spoolmate.service';
import { HeaderStatsComponent } from './components/header-stats/header-stats.component';
import { FilamentListComponent } from './components/filament-list/filament-list.component';
import { FilamentModalComponent } from './components/filament-modal/filament-modal.component';
import { ProjectCalculatorComponent } from './components/project-calculator/project-calculator.component';
import { ManufacturerManagerComponent } from './components/manufacturer-manager/manufacturer-manager.component';
import { SettingsPanelComponent } from './components/settings-panel/settings-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HeaderStatsComponent,
    FilamentListComponent,
    FilamentModalComponent,
    ProjectCalculatorComponent,
    ManufacturerManagerComponent,
    SettingsPanelComponent
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  activeTab: TabType = 'filaments';

  // Spulen-Modal-Status
  isFilamentModalOpen = false;
  filamentModalMode: 'create' | 'edit' | 'duplicate' = 'create';
  selectedFilamentForModal: Filament | null = null;

  // Vorausgewählte Spule beim Sprung "Zu Projekt"
  preselectedProjectFilamentId: number | null = null;

  constructor(public spoolmate: SpoolmateService) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.spoolmate.loadBootstrap();
    } catch (err: any) {
      this.spoolmate.showToast(
        err.message || 'Initialdaten konnten nicht geladen werden.',
        'error'
      );
    }
  }

  switchTab(tab: TabType): void {
    this.activeTab = tab;
  }

  openCreateFilamentModal(): void {
    this.filamentModalMode = 'create';
    this.selectedFilamentForModal = null;
    this.isFilamentModalOpen = true;
  }

  openEditFilamentModal(filament: Filament): void {
    this.filamentModalMode = 'edit';
    this.selectedFilamentForModal = filament;
    this.isFilamentModalOpen = true;
  }

  openDuplicateFilamentModal(filament: Filament): void {
    this.filamentModalMode = 'duplicate';
    this.selectedFilamentForModal = filament;
    this.isFilamentModalOpen = true;
  }

  closeFilamentModal(): void {
    this.isFilamentModalOpen = false;
  }

  handleSendToProject(filamentId: number): void {
    this.preselectedProjectFilamentId = filamentId;
    this.activeTab = 'projects';
  }
}
