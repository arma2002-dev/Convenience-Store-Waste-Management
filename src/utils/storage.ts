import { WasteItem } from '../types/waste';
import { generateSeedData } from '../data/seedData';

const STORAGE_KEY = 'cvs_waste_manager_items_v1';
const STORE_SETTINGS_KEY = 'cvs_waste_store_settings_v1';

export interface StoreSettings {
  storeName: string;
  brand: 'CU' | 'GS25' | '7-ELEVEN' | '이마트24' | '개인/기타';
  costRatio: number; // e.g. 0.7 (원가율 70%)
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'CU봉암공단점',
  brand: 'CU',
  costRatio: 0.7,
};

export function loadWasteItems(): WasteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = generateSeedData();
      saveWasteItems(initial);
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load waste items from storage:', e);
    return [];
  }
}

export function saveWasteItems(items: WasteItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save waste items to storage:', e);
  }
}

export function loadStoreSettings(): StoreSettings {
  try {
    const raw = localStorage.getItem(STORE_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load store settings:', e);
  }
  return DEFAULT_STORE_SETTINGS;
}

export function saveStoreSettings(settings: StoreSettings): void {
  try {
    localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save store settings:', e);
  }
}

// ========================================================
// Server Cloud Sync APIs (PC & Mobile Cross-Device Support)
// ========================================================

export interface ServerSyncResult {
  items: WasteItem[];
  storeSettings?: StoreSettings;
  version: number;
  lastUpdated?: string;
}

// Fetch all items from server
export async function fetchWasteItemsFromServer(): Promise<ServerSyncResult | null> {
  try {
    const res = await fetch('/api/waste-items');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.items)) {
      saveWasteItems(data.items);
      if (data.storeSettings) {
        saveStoreSettings(data.storeSettings);
      }
      return {
        items: data.items,
        storeSettings: data.storeSettings,
        version: data.version || 1,
        lastUpdated: data.lastUpdated,
      };
    }
  } catch (err) {
    console.warn('Network sync with server failed, using local storage:', err);
  }
  return null;
}

// Add an item to the server
export async function addWasteItemServer(
  item: Omit<WasteItem, 'id' | 'registeredAt'> & { id?: string; registeredAt?: string }
): Promise<WasteItem | null> {
  try {
    const res = await fetch('/api/waste-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && data.item) {
      return data.item;
    }
  } catch (err) {
    console.error('Failed to save waste item to server:', err);
  }
  return null;
}

// Update quantity / details on server
export async function updateWasteItemServer(
  id: string,
  updates: { quantity?: number; notes?: string; disposalTime?: string }
): Promise<boolean> {
  try {
    const res = await fetch(`/api/waste-items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to update waste item on server:', err);
    return false;
  }
}

// Delete item on server
export async function deleteWasteItemServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/waste-items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to delete waste item on server:', err);
    return false;
  }
}

// Merge local client items into server (prevents any data loss from offline/previous mobile session)
export async function syncLocalWasteItemsToServer(
  localItems: WasteItem[]
): Promise<ServerSyncResult | null> {
  try {
    const res = await fetch('/api/waste-items/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientItems: localItems }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.items)) {
      saveWasteItems(data.items);
      if (data.storeSettings) {
        saveStoreSettings(data.storeSettings);
      }
      return {
        items: data.items,
        storeSettings: data.storeSettings,
        version: data.version || 1,
        lastUpdated: data.lastUpdated,
      };
    }
  } catch (err) {
    console.warn('Initial sync to server failed:', err);
  }
  return null;
}

// Reset data on server
export async function resetWasteItemsServer(): Promise<WasteItem[] | null> {
  try {
    const res = await fetch('/api/waste-items/reset', {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.items)) {
      saveWasteItems(data.items);
      return data.items;
    }
  } catch (err) {
    console.error('Failed to reset waste items on server:', err);
  }
  return null;
}

// Save store settings to server
export async function saveStoreSettingsServer(settings: StoreSettings): Promise<boolean> {
  try {
    const res = await fetch('/api/store-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to save store settings to server:', err);
    return false;
  }
}

// Format numbers as Korean currency (e.g. 14,500원)
export function formatKRW(val: number): string {
  return val.toLocaleString('ko-KR') + '원';
}

// Export waste items to CSV
export function exportWasteToCSV(items: WasteItem[], fileName = '편의점_폐기관리대장.csv') {
  const headers = [
    '폐기일자',
    '폐기시간',
    '바코드',
    '상품명',
    '카테고리',
    '수량',
    '판매단가(원)',
    '총판매금액(원)',
    '원가단가(원)',
    '총원가손실(원)',
    '폐기사유',
    '비고',
  ];

  const rows = items.map((item) => [
    item.date,
    item.disposalTime,
    `"${item.barcode}"`,
    `"${item.productName.replace(/"/g, '""')}"`,
    `"${item.category}"`,
    item.quantity,
    item.unitPrice,
    item.unitPrice * item.quantity,
    item.costPrice,
    item.costPrice * item.quantity,
    `"${item.reason}"`,
    `"${(item.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
