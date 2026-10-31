export type WasteCategory =
  | '삼각김밥/주먹밥'
  | '도시락/덮밥'
  | '샌드위치/햄버거'
  | '김밥/롤'
  | '유제품/음료'
  | '디저트/베이커리'
  | '조리/튀김'
  | '기타';

export type DisposalTimeSlot = '02:00' | '14:00' | '20:00' | '22:00' | '수시/기타';

export type DisposalReason = '유통기한 경과' | '포장 훼손' | '신선도 저하' | '기타 사유';

export type StoreBrand = 'CU' | 'GS25' | '7-ELEVEN' | '이마트24' | '개인/기타';

export interface WasteItem {
  id: string;
  barcode: string;
  productName: string;
  category: WasteCategory;
  quantity: number;
  unitPrice: number; // 판매가 (KRW)
  costPrice: number; // 매입원가 (KRW)
  date: string; // YYYY-MM-DD
  disposalTime: string; // e.g., '02:00', '14:00', '20:00'
  reason: DisposalReason;
  storeBrand?: StoreBrand;
  registeredAt: string; // ISO string
  notes?: string;
  photoUrl?: string;
}

export interface PresetProduct {
  barcode: string;
  productName: string;
  category: WasteCategory;
  unitPrice: number;
  costPrice: number;
  defaultTimeSlot: DisposalTimeSlot;
  storeBrand?: StoreBrand;
}

export interface DayWasteSummary {
  date: string;
  totalItems: number;
  totalQuantity: number;
  totalRetailLoss: number;
  totalCostLoss: number;
  items: WasteItem[];
}

export interface AIWasteInsight {
  headline: string;
  topLossCategoryAnalysis: string;
  orderAdjustmentTip: string;
  clearanceRecommendation: string;
  estimatedSavingPercent: number;
}
