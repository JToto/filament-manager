export interface Manufacturer {
  id: number;
  name: string;
  country?: string;
  empty_spool_weight_g?: number;
  spool_count?: number;
  created_at?: string;
}

export interface Filament {
  id: number;
  manufacturer_id: number;
  manufacturer_name: string;
  material: string;
  series?: string;
  color_name: string;
  color_hex: string;
  purchase_price: number;
  initial_weight_g: number;
  remaining_weight_g: number;
  price_per_kg: number;
  notes?: string;
  created_at?: string;
}

export interface ProjectItem {
  id: number;
  project_id: number;
  filament_id: number | null;
  material?: string;
  filament_name: string;
  color_hex: string;
  price_per_kg: number;
  remaining_weight_g: number | null;
  weight_g: number;
  label: string;
  cost: number;
}

export interface Project {
  id: number;
  name: string;
  notes: string;
  created_at: string;
  image_data: string;
  print_time: string;
  threemf_filename: string;
  threemf_stored_name: string;
  items: ProjectItem[];
  total_weight_g: number;
  material_cost: number;
  print_time_hours: number;
  energy_kwh: number;
  energy_cost: number;
  total_cost: number;
}

export interface AppSettings {
  electricity_price_per_kwh: number;
  printer_power_kwh: number;
  printer_name: string;
}

export interface ThreeMfImportSummary {
  filename: string;
  thumbnailImported: boolean;
  printTime: string;
  itemsImported: number;
  availableSlicedFilaments: number;
  totalWeightG?: number;
  slicedViaCli?: boolean;
}

export interface BootstrapPayload {
  manufacturers: Manufacturer[];
  filaments: Filament[];
  projects: Project[];
  settings: AppSettings;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export type TabType = 'filaments' | 'projects' | 'manufacturers' | 'settings';
