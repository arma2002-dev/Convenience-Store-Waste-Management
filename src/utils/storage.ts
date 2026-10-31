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
