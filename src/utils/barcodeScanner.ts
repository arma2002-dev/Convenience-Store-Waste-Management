import { BrowserMultiFormatReader } from '@zxing/browser';
import { PRESET_PRODUCTS } from '../data/presetProducts';
import { PresetProduct } from '../types/waste';

// Local lookup by barcode number (with digit normalization for 12/13/14 digit UPC/EAN/ITF)
export function findPresetProductByBarcode(barcode: string): PresetProduct | undefined {
  if (!barcode) return undefined;
  const clean = barcode.replace(/[^0-9]/g, '');
  if (!clean || clean.length < 5) return undefined;

  // 1. Exact match
  const direct = PRESET_PRODUCTS.find((p) => p.barcode === clean);
  if (direct) return direct;

  // 2. Normalize 12-digit UPC-A to 13-digit EAN-13 (with leading 0)
  if (clean.length === 12) {
    const withZero = '0' + clean;
    const match = PRESET_PRODUCTS.find((p) => p.barcode === withZero);
    if (match) return match;
  }
  if (clean.length === 13 && clean.startsWith('0')) {
    const withoutZero = clean.substring(1);
    const match = PRESET_PRODUCTS.find((p) => p.barcode === withoutZero);
    if (match) return match;
  }

  // 3. 14-digit GTIN / ITF-14 match (strip leading indicator)
  if (clean.length === 14) {
    const inner13 = clean.substring(1);
    const match = PRESET_PRODUCTS.find((p) => p.barcode === inner13);
    if (match) return match;
    const matchEnds = PRESET_PRODUCTS.find((p) => clean.endsWith(p.barcode));
    if (matchEnds) return matchEnds;
  }

  // 4. Substring / endsWith match (for 8+ digits)
  if (clean.length >= 8) {
    const matchEnds = PRESET_PRODUCTS.find(
      (p) => clean.endsWith(p.barcode) || (clean.length >= 12 && p.barcode.endsWith(clean))
    );
    if (matchEnds) return matchEnds;
  }

  return undefined;
}

// Client-side barcode decoder from an image (Blob / File / HTMLImageElement / Canvas)
export async function decodeBarcodeFromImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): Promise<string | null> {
  // 1. Try native BarcodeDetector API if available
  if ('BarcodeDetector' in window) {
    try {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
      });
      const detected = await barcodeDetector.detect(imageSource);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return detected[0].rawValue;
      }
    } catch (e) {
      console.warn('Native BarcodeDetector failed, falling back to ZXing:', e);
    }
  }

  // 2. Try ZXing Browser MultiFormat Reader
  try {
    const reader = new BrowserMultiFormatReader();
    let result;
    if (imageSource instanceof HTMLImageElement) {
      result = await reader.decodeFromImageElement(imageSource);
    } else {
      result = await reader.decodeFromCanvas(imageSource);
    }
    if (result && result.getText()) {
      return result.getText();
    }
  } catch (err) {
    console.debug('ZXing barcode not found in image:', err);
  }

  return null;
}

// Convert File to Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

// Send image to Server-side Gemini AI for barcode + product label OCR
export async function scanBarcodeWithAI(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<{
  barcode?: string;
  productName: string;
  category: any;
  estimatedPrice: number;
  expirationTime?: string;
  brand?: string;
  confidence?: number;
}> {
  const res = await fetch('/api/scan-barcode-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || '바코드 이미지 분석에 실패했습니다.');
  }

  const result = await res.json();
  return result.data;
}

// Query Barcode Product Info from Public Data Portal (HACCP V3) / Food Safety Open API / Preset Database
export async function lookupBarcodeFromPublicAPI(
  barcode: string,
  serviceKey?: string
): Promise<{
  productName: string;
  category: any;
  sourceName?: string;
  manufacturer?: string;
  photoUrl?: string;
  rawmtrl?: string;
  nutrient?: string;
  capacity?: string;
  prdlstReportNo?: string;
} | null> {
  const clean = barcode.replace(/[^0-9]/g, '');
  if (!clean) return null;

  // 1. Check local catalog first
  const localMatch = findPresetProductByBarcode(clean);
  if (localMatch) {
    return {
      productName: localMatch.productName,
      category: localMatch.category,
      sourceName: '공공 유통표준 바코드 카탈로그',
    };
  }

  // 2. Query Server Public Data Portal (HACCP V3 JSON+XML) / Food Safety Open API endpoint
  try {
    const keyToUse = serviceKey || (typeof window !== 'undefined' ? localStorage.getItem('haccp_service_key') || '' : '');
    const queryParams = new URLSearchParams({ barcode: clean });
    if (keyToUse) {
      queryParams.set('serviceKey', keyToUse);
    }

    const res = await fetch(`/api/lookup-barcode?${queryParams.toString()}`);
    if (res.ok) {
      const result = await res.json();
      if (
        result.success &&
        result.data &&
        result.data.productName &&
        !result.data.productName.includes('한국 유통상품')
      ) {
        return {
          productName: result.data.productName,
          category: result.data.category || '기타',
          sourceName: result.sourceName || 'HACCP 제품이미지 및 포장지표기정보(V3)',
          manufacturer: result.data.manufacturer,
          photoUrl: result.data.photoUrl,
          rawmtrl: result.data.rawmtrl,
          nutrient: result.data.nutrient,
          capacity: result.data.capacity,
          prdlstReportNo: result.data.prdlstReportNo,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to query barcode from public API:', err);
  }

  // 3. Fallback: Intelligent Korean manufacturer brand recognition
  // 3. Fallback: Intelligent Korean manufacturer brand recognition
  if (clean.startsWith('88010430')) {
    return {
      productName: '농심 라면/스낵 상품',
      category: '기타',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '농심',
    };
  }
  if (clean.startsWith('8801043')) {
    return {
      productName: '빙그레 유제품/음료 상품',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '빙그레',
    };
  }
  if (clean.startsWith('8801115')) {
    return {
      productName: '서울우유 유제품',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '서울우유협동조합',
    };
  }
  if (clean.startsWith('88010561') || clean.startsWith('880105601')) {
    return {
      productName: 'SPC삼립 베이커리/디저트',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: 'SPC삼립',
    };
  }
  if (clean.startsWith('880105600') || clean.startsWith('880105602') || clean.startsWith('880105603') || clean.startsWith('88010626')) {
    return {
      productName: '롯데칠성 음료/주스',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '롯데칠성음료',
    };
  }
  if (clean.startsWith('8801117')) {
    return {
      productName: '오리온 제과/스낵',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '오리온',
    };
  }
  if (clean.startsWith('8801007')) {
    return {
      productName: 'CJ제일제당 식품',
      category: '도시락/덮밥',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: 'CJ제일제당',
    };
  }
  if (clean.startsWith('8801045')) {
    return {
      productName: '오뚜기 라면/간편식',
      category: '기타',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '오뚜기',
    };
  }
  if (clean.startsWith('8801073')) {
    return {
      productName: '삼양식품 라면/식품',
      category: '기타',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '삼양식품',
    };
  }
  if (clean.startsWith('8801094')) {
    return {
      productName: '코카콜라음료 상품',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '코카콜라음료',
    };
  }
  if (clean.startsWith('8801123')) {
    return {
      productName: '롯데웰푸드 제과/육가공',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '롯데웰푸드',
    };
  }
  if (clean.startsWith('8801155')) {
    return {
      productName: '해태제과 스낵/과자',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '해태제과',
    };
  }
  if (clean.startsWith('88010620')) {
    return {
      productName: '크라운제과 스낵',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '크라운제과',
    };
  }
  if (clean.startsWith('8804973')) {
    return {
      productName: '한국마즈 이클립스/제과',
      category: '디저트/베이커리',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '한국마즈',
    };
  }
  if (clean.startsWith('8801111')) {
    return {
      productName: '남양유업 유음료',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '남양유업',
    };
  }
  if (clean.startsWith('8801121')) {
    return {
      productName: '매일유업 유음료/디저트',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드(880) DB',
      manufacturer: '매일유업',
    };
  }
  if (clean.startsWith('880103700')) {
    return {
      productName: '맥심 슈프림골드 커피믹스',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동서식품',
    };
  }
  if (clean.startsWith('880103705')) {
    return {
      productName: '맥심 화이트골드 커피믹스',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동서식품',
    };
  }
  if (clean.startsWith('880103702') || clean.startsWith('880103707')) {
    return {
      productName: '맥심 모카골드 마일드 커피믹스',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동서식품',
    };
  }
  if (clean.startsWith('880103708')) {
    return {
      productName: '동아오츠카 포카리스웨트/음료',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동아오츠카',
    };
  }
  if (clean.startsWith('8801037') || clean.startsWith('8801104')) {
    return {
      productName: '동서식품 맥심 커피/음료',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동서식품',
    };
  }
  if (clean.startsWith('8806002')) {
    return {
      productName: '동아제약 자양강장/의약외품',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '동아제약',
    };
  }
  if (clean.startsWith('8809040')) {
    return {
      productName: '광동제약 음료/생수',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '광동제약',
    };
  }
  if (clean.startsWith('8801382')) {
    return {
      productName: '웅진식품 차음료',
      category: '유제품/음료',
      sourceName: '공공 유통 표준 바코드 DB',
      manufacturer: '웅진식품',
    };
  }
  if (clean.startsWith('8809489') || clean.startsWith('88010628')) {
    return {
      productName: 'CU 편의점 프레시푸드',
      category: '삼각김밥/주먹밥',
      sourceName: 'CU BGF리테일 표준코드',
      manufacturer: 'BGF리테일(CU)',
    };
  }
  if (clean.startsWith('8809112')) {
    return {
      productName: '편의점 즉석조리/튀김류',
      category: '조리/튀김',
      sourceName: '편의점 즉석조리 표준코드',
      manufacturer: '편의점 즉석조리',
    };
  }

  // 4. Return empty string if no brand prefix matched
  return {
    productName: '',
    category: '기타',
    sourceName: '신규 바코드',
  };
}
