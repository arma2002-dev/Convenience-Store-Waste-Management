import { WasteItem } from '../types/waste';
import { PRESET_PRODUCTS } from './presetProducts';

// Generate dynamic realistic seed waste logs covering recent 30 days based on given anchor date
export function generateSeedData(): WasteItem[] {
  const items: WasteItem[] = [];
  const today = new Date();
  
  // Create waste logs for the last 20 days and today
  const sampleDaysOffset = [0, 0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 18, 20, 22];

  let idCounter = 1;
  sampleDaysOffset.forEach((daysAgo, index) => {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - daysAgo);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Pick 1 to 3 items for this day
    const presetIndex1 = (index * 3) % PRESET_PRODUCTS.length;
    const presetIndex2 = (index * 3 + 1) % PRESET_PRODUCTS.length;

    const p1 = PRESET_PRODUCTS[presetIndex1];
    const qty1 = (index % 3) + 1;
    items.push({
      id: `seed-${idCounter++}`,
      barcode: p1.barcode,
      productName: p1.productName,
      category: p1.category,
      quantity: qty1,
      unitPrice: p1.unitPrice,
      costPrice: p1.costPrice,
      date: dateStr,
      disposalTime: p1.defaultTimeSlot,
      reason: index % 7 === 0 ? '포장 훼손' : '유통기한 경과',
      storeBrand: p1.storeBrand || 'CU',
      registeredAt: new Date(targetDate.getTime() + 1000 * 60 * 60 * 18).toISOString(),
      notes: index % 4 === 0 ? '야간 근무 타임 폐기 등록' : undefined,
    });

    if (daysAgo % 2 === 0) {
      const p2 = PRESET_PRODUCTS[presetIndex2];
      const qty2 = (index % 2) + 1;
      items.push({
        id: `seed-${idCounter++}`,
        barcode: p2.barcode,
        productName: p2.productName,
        category: p2.category,
        quantity: qty2,
        unitPrice: p2.unitPrice,
        costPrice: p2.costPrice,
        date: dateStr,
        disposalTime: p2.defaultTimeSlot,
        reason: '유통기한 경과',
        storeBrand: p2.storeBrand || 'GS25',
        registeredAt: new Date(targetDate.getTime() + 1000 * 60 * 60 * 20).toISOString(),
      });
    }
  });

  return items;
}
