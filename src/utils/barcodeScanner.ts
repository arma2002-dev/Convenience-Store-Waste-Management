import { BrowserMultiFormatReader } from '@zxing/browser';
import { PRESET_PRODUCTS } from '../data/presetProducts';
import { PresetProduct } from '../types/waste';

// Local lookup by barcode number
export function findPresetProductByBarcode(barcode: string): PresetProduct | undefined {
  const clean = barcode.trim();
  return PRESET_PRODUCTS.find((p) => p.barcode === clean);
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
    // Expected when barcode is not sharply visible or angled
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

// Query Barcode Product Info from Public Data Portal (data.go.kr) & Open API
export async function lookupBarcodeFromPublicAPI(barcode: string): Promise<{
  productName: string;
  category: any;
  sourceName?: string;
  manufacturer?: string;
} | null> {
  const clean = barcode.trim();
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

  // 2. Query Server Public Data Portal / Food Safety Open API endpoint
  try {
    const res = await fetch(`/api/lookup-barcode?barcode=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data && result.data.productName) {
        return {
          productName: result.data.productName,
          category: result.data.category,
          sourceName: result.sourceName || '공공데이터포털(data.go.kr) 유통바코드 API',
          manufacturer: result.data.manufacturer,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to query barcode from public API:', err);
  }

  return null;
}
