import { Injectable } from '@angular/core';
import {
  AppSettings,
  BootstrapPayload,
  Filament,
  Manufacturer,
  Project,
  ThreeMfImportSummary,
  ToastMessage
} from '../models/spoolmate.models';

/**
 * Zentraler State- und API-Service für SpoolMate.
 * Kapselt alle REST-Aufrufe zum Backend und hält den reaktiven Anwendungszustand synchron.
 */
@Injectable({
  providedIn: 'root'
})
export class SpoolmateService {
  manufacturers: Manufacturer[] = [];
  filaments: Filament[] = [];
  projects: Project[] = [];
  settings: AppSettings = {
    electricity_price_per_kwh: 0.35,
    printer_power_kwh: 0.12,
    printer_name: ''
  };

  toasts: ToastMessage[] = [];
  private nextToastId = 1;

  // In-App Prompt-Dialog (funktioniert im Browser und nativ in Electron, wo window.prompt fehlt)
  promptState: {
    isOpen: boolean;
    message: string;
    value: string;
    resolve?: (val: string | null) => void;
  } = {
    isOpen: false,
    message: '',
    value: ''
  };

  prompt(message: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
      this.promptState = {
        isOpen: true,
        message,
        value: defaultValue,
        resolve
      };
    });
  }

  closePrompt(confirmed: boolean): void {
    const r = this.promptState.resolve;
    const val = confirmed ? this.promptState.value : null;
    this.promptState = { isOpen: false, message: '', value: '' };
    if (r) r(val);
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const id = this.nextToastId++;
    this.toasts.push({ id, message, type });
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 3500);
  }

  private async apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Ein unbekannter Serverfehler ist aufgetreten.');
    }
    return data as T;
  }

  async loadBootstrap(): Promise<void> {
    const data = await this.apiRequest<BootstrapPayload>('/api/bootstrap');
    this.manufacturers = data.manufacturers || [];
    this.filaments = data.filaments || [];
    this.projects = data.projects || [];
    if (data.settings) {
      this.settings = data.settings;
    }
  }

  // ==================== HERSTELLER ====================

  async createManufacturer(payload: {
    name: string;
    country: string;
    empty_spool_weight_g: number;
  }): Promise<number> {
    const res = await this.apiRequest<{
      id: number;
      manufacturers: Manufacturer[];
    }>('/api/manufacturers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    this.manufacturers = res.manufacturers;
    return res.id;
  }

  async updateManufacturer(
    id: number,
    payload: { name: string; country: string; empty_spool_weight_g: number }
  ): Promise<void> {
    const res = await this.apiRequest<{
      manufacturers: Manufacturer[];
      filaments: Filament[];
      projects: Project[];
    }>(`/api/manufacturers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.manufacturers = res.manufacturers;
    if (res.filaments) this.filaments = res.filaments;
    if (res.projects) this.projects = res.projects;
  }

  async deleteManufacturer(id: number): Promise<void> {
    const res = await this.apiRequest<{ manufacturers: Manufacturer[] }>(
      `/api/manufacturers/${id}`,
      { method: 'DELETE' }
    );
    this.manufacturers = res.manufacturers;
  }

  // ==================== FILAMENTE ====================

  async saveFilament(payload: Partial<Filament>, id?: number | null): Promise<void> {
    const url = id ? `/api/filaments/${id}` : '/api/filaments';
    const method = id ? 'PUT' : 'POST';
    const res = await this.apiRequest<{
      filaments: Filament[];
      manufacturers: Manufacturer[];
      projects?: Project[];
    }>(url, {
      method,
      body: JSON.stringify(payload)
    });
    this.filaments = res.filaments;
    this.manufacturers = res.manufacturers;
    if (res.projects) {
      this.projects = res.projects;
    }
  }

  async adjustFilamentWeight(id: number, deltaG: number): Promise<void> {
    const res = await this.apiRequest<{
      filaments: Filament[];
      projects?: Project[];
    }>(`/api/filaments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ delta_g: deltaG })
    });
    this.filaments = res.filaments;
    if (res.projects) {
      this.projects = res.projects;
    }
  }

  async setFilamentRemainingWeight(id: number, remainingWeightG: number): Promise<void> {
    const res = await this.apiRequest<{
      filaments: Filament[];
      projects?: Project[];
    }>(`/api/filaments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ remaining_weight_g: remainingWeightG })
    });
    this.filaments = res.filaments;
    if (res.projects) {
      this.projects = res.projects;
    }
  }

  async deleteFilament(id: number): Promise<void> {
    const res = await this.apiRequest<{
      filaments: Filament[];
      manufacturers: Manufacturer[];
      projects?: Project[];
    }>(`/api/filaments/${id}`, { method: 'DELETE' });
    this.filaments = res.filaments;
    this.manufacturers = res.manufacturers;
    if (res.projects) {
      this.projects = res.projects;
    }
  }

  // ==================== PROJEKTE & .3MF ====================

  async createProject(payload: {
    name: string;
    print_time: string;
    notes: string;
    image_data: string;
  }): Promise<number> {
    const res = await this.apiRequest<{ id: number; projects: Project[] }>(
      '/api/projects',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    this.projects = res.projects;
    return res.id;
  }

  async updateProject(
    projectId: number,
    payload: { name: string; print_time: string; notes: string }
  ): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/projects/${projectId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
    this.projects = res.projects;
  }

  async patchProject(
    projectId: number,
    payload: Partial<{ print_time: string; image_data: string }>
  ): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/projects/${projectId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
    this.projects = res.projects;
  }

  async deleteProject(projectId: number): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/projects/${projectId}`,
      { method: 'DELETE' }
    );
    this.projects = res.projects;
  }

  async uploadThreeMf(
    projectId: number,
    file: File,
    options: { overwriteImage?: boolean; replaceItems?: boolean } = {}
  ): Promise<ThreeMfImportSummary | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
      'X-Overwrite-Image': options.overwriteImage ? '1' : '0',
      'X-Replace-Items': options.replaceItems ? '1' : '0'
    };
    const res = await fetch(`/api/projects/${projectId}/threemf`, {
      method: 'POST',
      headers,
      body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Fehler beim Hochladen der .3mf Datei');
    }
    this.projects = data.projects;
    return (data.imported as ThreeMfImportSummary) || null;
  }

  async removeThreeMf(projectId: number): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/projects/${projectId}/threemf`,
      { method: 'DELETE' }
    );
    this.projects = res.projects;
  }

  async openInBambuStudio(projectId: number): Promise<{ filename: string }> {
    return this.apiRequest<{ ok: boolean; filename: string }>(
      `/api/projects/${projectId}/open-slicer`,
      { method: 'POST' }
    );
  }

  async deductProjectStock(projectId: number): Promise<void> {
    const res = await this.apiRequest<{
      filaments: Filament[];
      projects: Project[];
    }>(`/api/projects/${projectId}/deduct`, { method: 'POST' });
    this.filaments = res.filaments;
    this.projects = res.projects;
  }

  async addProjectItem(
    projectId: number,
    payload: { filament_id: number; weight_g: number; label: string }
  ): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/projects/${projectId}/items`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    this.projects = res.projects;
  }

  async updateProjectItem(
    itemId: number,
    payload: Partial<{ filament_id: number; weight_g: number; label: string }>
  ): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/project-items/${itemId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
    this.projects = res.projects;
  }

  async deleteProjectItem(itemId: number): Promise<void> {
    const res = await this.apiRequest<{ projects: Project[] }>(
      `/api/project-items/${itemId}`,
      { method: 'DELETE' }
    );
    this.projects = res.projects;
  }

  // ==================== EINSTELLUNGEN ====================

  async updateSettings(payload: AppSettings): Promise<void> {
    const res = await this.apiRequest<{
      settings: AppSettings;
      projects: Project[];
    }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.settings = res.settings;
    if (res.projects) {
      this.projects = res.projects;
    }
  }
}
