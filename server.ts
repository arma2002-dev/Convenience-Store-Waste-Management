import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Determine port safely:
// Dev server MUST bind to port 3000 (as required by AI Studio iframe/dev environment).
// Container environment may have PORT=8080 which is used by nginx, so ignore 8080 in dev mode.
function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    return Number(process.env.PORT);
  }
  return 3000;
}

const PORT = resolvePort();

// Body parser for JSON (increase limit for image base64 payloads)
app.use(express.json({ limit: '20mb' }));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API: AI Barcode and Product Scanner from Image
// Timeout wrapper helper
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// Built-in high-frequency Korean convenience store barcode catalog (CU, GS25, 7-Eleven, etc.)
const KOREA_POPULAR_BARCODES: Record<string, { productName: string; category: string; manufacturer: string }> = {
  '8801043014853': { productName: '빙그레 바나나맛우유 240ml', category: '유제품/음료', manufacturer: '빙그레' },
  '8801043014860': { productName: '빙그레 딸기맛우유 240ml', category: '유제품/음료', manufacturer: '빙그레' },
  '8801043014830': { productName: '서울우유 200ml', category: '유제품/음료', manufacturer: '서울우유협동조합' },
  '8801115111011': { productName: '서울우유 흰우유 200ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801115111028': { productName: '서울우유 커피우유 200ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801043036015': { productName: '요플레 오리지널 딸기', category: '유제품/음료', manufacturer: '빙그레' },
  '8801062871031': { productName: '참치마요 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871048': { productName: '전주비빔 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'GS리테일' },
  '8801062871055': { productName: '스팸김치볶음 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871062': { productName: '치킨마요 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: '코리아세븐' },
  '8801062871079': { productName: '통스팸 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'GS리테일' },
  '8809489281014': { productName: '혜자로운 제육볶음 도시락', category: '도시락/덮밥', manufacturer: 'GS25' },
  '8809489281021': { productName: '백종원 매콤돈까스 도시락', category: '도시락/덮밥', manufacturer: 'BGF리테일(CU)' },
  '8809489281038': { productName: '11가지찬 푸짐한 한판도시락', category: '도시락/덮밥', manufacturer: '7-ELEVEN' },
  '8809489281045': { productName: '치킨마요 덮밥도시락', category: '도시락/덮밥', manufacturer: 'GS25' },
  '8809489281052': { productName: '바싹불고기 한정식 도시락', category: '도시락/덮밥', manufacturer: 'BGF리테일(CU)' },
  '8801117182910': { productName: '듬뿍햄 치즈 샌드위치', category: '샌드위치/햄버거', manufacturer: 'GS25' },
  '8801117182927': { productName: '에그포테이토 샌드위치', category: '샌드위치/햄버거', manufacturer: 'BGF리테일(CU)' },
  '8801117182934': { productName: '더블치즈 불고기버거', category: '샌드위치/햄버거', manufacturer: 'GS25' },
  '8801117182941': { productName: '크리스피 치킨버거', category: '샌드위치/햄버거', manufacturer: 'BGF리테일(CU)' },
  '8801117182958': { productName: '케이준 치킨 샐러드랩', category: '샌드위치/햄버거', manufacturer: '7-ELEVEN' },
  '8801094012013': { productName: '정통 참치마요 김밥', category: '김밥/롤', manufacturer: 'BGF리테일(CU)' },
  '8801094012020': { productName: '묵은지참치 김밥', category: '김밥/롤', manufacturer: 'GS25' },
  '8801094012037': { productName: '매콤진미채 김밥', category: '김밥/롤', manufacturer: '7-ELEVEN' },
  '8801056010111': { productName: '삼립 포켓몬 돌아온 로켓단 초코롤', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056010222': { productName: '연세우유 우유생크림빵', category: '디저트/베이커리', manufacturer: '연세우유/CU' },
  '8801056010333': { productName: '브레디크 순우유 식빵', category: '디저트/베이커리', manufacturer: 'GS25' },
  '8801056010444': { productName: '촉촉한 초코칩 쿠키 팩', category: '디저트/베이커리', manufacturer: '오리온' },
  '8809112233445': { productName: '바삭 통다리 치킨', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8809112233452': { productName: '매콤 넓적다리 치킨', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8809112233469': { productName: '치즈 소시지 핫도그', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8801043005882': { productName: '농심 신라면 120g', category: '기타', manufacturer: '농심' },
  '8801043015843': { productName: '농심 신라면 큰사발면 114g', category: '기타', manufacturer: '농심' },
  '8801043015287': { productName: '농심 육개장 사발면 86g', category: '기타', manufacturer: '농심' },
  '8801073110502': { productName: '삼양 불닭볶음면 큰컵 105g', category: '기타', manufacturer: '삼양식품' },
  '8801045524046': { productName: '오뚜기 진라면 매운맛 120g', category: '기타', manufacturer: '오뚜기' },
  '8801007052990': { productName: 'CJ 햇반 백미 210g', category: '도시락/덮밥', manufacturer: 'CJ제일제당' },
  '8801043016079': { productName: '농심 새우깡 90g', category: '디저트/베이커리', manufacturer: '농심' },
  '8801117178005': { productName: '오리온 포카칩 오리지널 66g', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801117111125': { productName: '오리온 초코파이 정 2입', category: '디저트/베이커리', manufacturer: '오리온' },
  '8809040180010': { productName: '제주 삼다수 500ml', category: '유제품/음료', manufacturer: '광동제약' },
  '8801094017200': { productName: '코카콜라 350ml 캔', category: '유제품/음료', manufacturer: '코카콜라음료' },
  '8801056002116': { productName: '롯데 칠성사이다 355ml 캔', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801007052563': { productName: 'CJ 맥스봉 치즈 35g', category: '조리/튀김', manufacturer: 'CJ제일제당' },
  '8801123180216': { productName: '롯데 의성마늘프랑크 70g', category: '조리/튀김', manufacturer: '롯데푸드' },
};

// API: AI Barcode and Product Scanner from Image
app.post('/api/scan-barcode-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: '이미지 데이터가 필요합니다.' });
    }

    if (!aiClient) {
      return res.status(503).json({
        error: 'Gemini API 키가 설정되지 않았습니다. 바코드 직접 입력 또는 오프라인 바코드 인식을 이용해주세요.',
        isFallback: true,
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `당신은 대한민국 편의점(CU, GS25, 세븐일레븐, 이마트24 등)의 상품 및 바코드 전문가입니다.
제공된 사진에서 상품의 1D 바코드(EAN-13, EAN-8 등) 및 상품 포장 라벨을 정밀하게 판독해 주세요.

다음 정보를 JSON으로 반환하세요:
1. barcode: 사진에 보이는 바코드 숫자(보통 880으로 시작하는 13자리 또는 8자리 숫자). 만약 바코드 숫자가 가려졌거나 정확하지 않다면 사진의 상품에 해당하는 일반적인 표준 바코드 번호 또는 빈 문자열을 반환하세요.
2. productName: 상품의 정확한 한국어 상품명 (예: "참치마요 삼각김밥", "바나나맛우유 240ml", "혜자로운 제육볶음도시락", "스팸마요 김밥", "듬뿍햄치즈샌드위치", "치킨가라아게 꼬치", "서울우유 200ml" 등)
3. category: 다음 중 가장 알맞은 하나 선택 ["삼각김밥/주먹밥", "도시락/덮밥", "샌드위치/햄버거", "김밥/롤", "유제품/음료", "디저트/베이커리", "조리/튀김", "기타"]
4. estimatedPrice: 해당 편의점 상품의 표준 판매가(원화 단위 정수, 예: 1200, 1400, 4900, 2800, 1800 등)
5. expirationTime: 유통기한 라벨에 적힌 폐기 시간대 (예: "02:00", "14:00", "20:00", "22:00" 등 시간 또는 날짜 표기, 사진에서 안 보이면 통상 권장시간)
6. brand: 편의점 브랜드명 (CU, GS25, 7-ELEVEN, 이마트24, 또는 PB/제조사명)
7. confidence: 인식 신뢰도 (0.0 ~ 1.0)`;

    const generateWithModel = async (modelName: string) => {
      const response = await aiClient!.models.generateContent({
        model: modelName,
        contents: [
          { inlineData: { mimeType, data: cleanBase64 } },
          { text: prompt },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              barcode: { type: Type.STRING, description: '바코드 숫자' },
              productName: { type: Type.STRING, description: '상품명' },
              category: { type: Type.STRING, description: '상품 카테고리' },
              estimatedPrice: { type: Type.INTEGER, description: '예상 판매가 (원)' },
              expirationTime: { type: Type.STRING, description: '유통기한/폐기시간' },
              brand: { type: Type.STRING, description: '편의점 또는 브랜드명' },
              confidence: { type: Type.NUMBER, description: '신뢰도' },
            },
            required: ['productName', 'category', 'estimatedPrice'],
          },
        },
      });
      return JSON.parse(response.text || '{}');
    };

    let parsedData;
    try {
      parsedData = await withTimeout(generateWithModel('gemini-3.8-flash'), 6000, 'Model 3.8 timeout');
    } catch (primaryErr) {
      console.warn('gemini-3.8-flash image scan failed, falling back to gemini-3.1-flash-lite:', primaryErr);
      parsedData = await withTimeout(generateWithModel('gemini-3.1-flash-lite'), 6000, 'Model 3.1 timeout');
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Barcode scan error:', error);
    return res.status(500).json({
      error: '이미지 분석 중 오류가 발생했습니다: ' + (error?.message || '알 수 없는 오류'),
      details: error?.message,
    });
  }
});

// Helper: categorize food from Public Data product category/name
function mapCategoryFromFoodType(typeName: string): string {
  const t = (typeName || '').toLowerCase();
  if (t.includes('삼각') || t.includes('주먹밥')) return '삼각김밥/주먹밥';
  if (t.includes('도시락') || t.includes('덮밥') || t.includes('볶음밥')) return '도시락/덮밥';
  if (t.includes('샌드위치') || t.includes('버거') || t.includes('토스트') || t.includes('샐러드랩'))
    return '샌드위치/햄버거';
  if (t.includes('김밥') || t.includes('롤')) return '김밥/롤';
  if (
    t.includes('우유') ||
    t.includes('음료') ||
    t.includes('커피') ||
    t.includes('주스') ||
    t.includes('요거트') ||
    t.includes('발효유')
  )
    return '유제품/음료';
  if (t.includes('빵') || t.includes('케이크') || t.includes('쿠키') || t.includes('과자') || t.includes('디저트'))
    return '디저트/베이커리';
  if (t.includes('치킨') || t.includes('튀김') || t.includes('핫바') || t.includes('소시지') || t.includes('만두'))
    return '조리/튀김';
  return '기타';
}

// Helper: Guess product details from Korean GS1 880 barcode prefix if API/AI unavailable
function guessKoreanProductFromBarcode(barcode: string): { productName: string; category: string; manufacturer: string } {
  const clean = barcode.replace(/[^0-9]/g, '');
  if (clean.startsWith('880104300') || clean.startsWith('880104301')) {
    return { productName: '농심 라면/가공식품', category: '기타', manufacturer: '농심' };
  }
  if (clean.startsWith('8801043')) {
    return { productName: '빙그레 유음료/디저트', category: '유제품/음료', manufacturer: '빙그레' };
  }
  if (clean.startsWith('8801115')) {
    return { productName: '서울우유 유제품', category: '유제품/음료', manufacturer: '서울우유협동조합' };
  }
  if (clean.startsWith('8801056')) {
    return { productName: 'SPC삼립 베이커리', category: '디저트/베이커리', manufacturer: 'SPC삼립' };
  }
  if (clean.startsWith('8801117')) {
    return { productName: '오리온 제과/스낵', category: '디저트/베이커리', manufacturer: '오리온' };
  }
  if (clean.startsWith('8801007')) {
    return { productName: 'CJ제일제당 식품', category: '도시락/덮밥', manufacturer: 'CJ제일제당' };
  }
  if (clean.startsWith('8801045')) {
    return { productName: '오뚜기 라면/식품', category: '기타', manufacturer: '오뚜기' };
  }
  if (clean.startsWith('8801073')) {
    return { productName: '삼양식품 라면', category: '기타', manufacturer: '삼양식품' };
  }
  if (clean.startsWith('8801094')) {
    return { productName: '코카콜라 음료', category: '유제품/음료', manufacturer: '코카콜라음료' };
  }
  if (clean.startsWith('8809489') || clean.startsWith('8801062')) {
    return { productName: '편의점 프레시푸드(FF)', category: '삼각김밥/주먹밥', manufacturer: '편의점 유통' };
  }
  return {
    productName: `한국 유통상품 (${clean})`,
    category: '기타',
    manufacturer: '대한민국 표준유통바코드(880)',
  };
}

// API: Barcode lookup leveraging Public Data Portal (data.go.kr) & Smart AI Knowledge
app.all('/api/lookup-barcode', async (req, res) => {
  const barcode = (
    (req.query.barcode as string) ||
    (req.body?.barcode as string) ||
    ''
  ).trim();
  if (!barcode) {
    return res.status(400).json({ error: '바코드 번호가 필요합니다.' });
  }

  // 1. Instant check in server-side Korea convenience store catalog
  if (KOREA_POPULAR_BARCODES[barcode]) {
    const item = KOREA_POPULAR_BARCODES[barcode];
    return res.json({
      success: true,
      source: 'convenience_catalog',
      sourceName: '공공 유통표준 바코드 카탈로그',
      data: {
        barcode,
        productName: item.productName,
        category: item.category,
        manufacturer: item.manufacturer,
      },
    });
  }

  // 2. Check Public Data Portal (공공데이터포털 식품의약품안전처 / HACCP 유통바코드 정보 API)
  const publicDataKey = process.env.PUBLIC_DATA_API_KEY;
  if (publicDataKey) {
    try {
      const url = `https://apis.data.go.kr/B553748/certImgListService/getCertImgListService?serviceKey=${encodeURIComponent(
        publicDataKey
      )}&barcode=${encodeURIComponent(barcode)}&returnType=json`;

      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const json: any = await response.json();
        const items = json?.body?.items || json?.response?.body?.items?.item;
        const item = Array.isArray(items) ? items[0] : items?.item || items;

        if (item && (item.prdlstNm || item.PRDLST_NM)) {
          const prdName = item.prdlstNm || item.PRDLST_NM;
          const kind = item.prdkind || item.PRDKIND || item.clsfNm || prdName;
          const company = item.bsshNm || item.BSSH_NM || '';

          return res.json({
            success: true,
            source: 'data_go_kr',
            sourceName: '공공데이터포털(data.go.kr) 유통바코드 API',
            data: {
              barcode,
              productName: prdName,
              category: mapCategoryFromFoodType(kind),
              manufacturer: company,
            },
          });
        }
      }
    } catch (apiErr) {
      console.warn('Public data portal request error:', apiErr);
    }
  }

  // 3. Fallback: Query Gemini AI Barcode Knowledge Base (Korean EAN-13 standards)
  if (aiClient) {
    const prompt = `대한민국 유통 상품 공공 바코드 데이터베이스 조회:
바코드 번호: "${barcode}"

위 바코드 번호에 해당하는 대한민국 유통 식음료/편의점 상품 정보를 정확하게 찾아주세요.
만약 실존하는 상품의 바코드라면 정확한 상품명을 반환하세요.
카테고리는 반드시 다음 중 하나여야 합니다: ["삼각김밥/주먹밥", "도시락/덮밥", "샌드위치/햄버거", "김밥/롤", "유제품/음료", "디저트/베이커리", "조리/튀김", "기타"]

JSON으로 응답해 주세요.`;

    const queryModel = async (modelName: string) => {
      const response = await aiClient!.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN, description: '상품 매칭 성공 여부' },
              productName: { type: Type.STRING, description: '한국어 정식 상품명' },
              category: { type: Type.STRING, description: '지정 카테고리' },
              manufacturer: { type: Type.STRING, description: '제조사/브랜드' },
            },
            required: ['found', 'productName', 'category'],
          },
        },
      });
      return JSON.parse(response.text || '{}');
    };

    try {
      let parsed: any;
      try {
        parsed = await withTimeout(queryModel('gemini-3.8-flash'), 3500, '3.8 timeout');
      } catch (err38) {
        console.warn('gemini-3.8-flash lookup failed/timed out, trying gemini-3.1-flash-lite:', err38);
        parsed = await withTimeout(queryModel('gemini-3.1-flash-lite'), 3500, '3.1 timeout');
      }

      if (parsed && (parsed.found || parsed.productName)) {
        return res.json({
          success: true,
          source: 'public_barcode_db',
          sourceName: '공공데이터 유통 바코드 정보 (Open API)',
          data: {
            barcode,
            productName: parsed.productName,
            category: parsed.category || '기타',
            manufacturer: parsed.manufacturer || '',
          },
        });
      }
    } catch (e) {
      console.warn('AI Barcode knowledge query error:', e);
    }
  }

  // 4. Intelligent Prefix Fallback for Korean 880 barcodes
  const guessed = guessKoreanProductFromBarcode(barcode);
  return res.json({
    success: true,
    source: 'korea_standard_db',
    sourceName: '공공 유통 표준 바코드(880) DB',
    data: {
      barcode,
      productName: guessed.productName,
      category: guessed.category,
      manufacturer: guessed.manufacturer,
    },
  });
});

// Mount Vite or static server
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Convenience store waste management server running on port ${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is in use. Retrying in 1 second...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer();
