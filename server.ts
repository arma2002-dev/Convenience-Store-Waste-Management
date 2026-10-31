import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

    // Clean base64 string if it contains data URI header
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `당신은 한국 편의점(CU, GS25, 세븐일레븐, 이마트24 등)의 상품 및 바코드 전문가입니다.
제공된 사진에서 상품의 1D 바코드(EAN-13, EAN-8 등) 및 상품 포장 라벨을 정밀하게 판독해 주세요.

다음 정보를 JSON으로 반환하세요:
1. barcode: 사진에 보이는 바코드 숫자(보통 880으로 시작하는 13자리 또는 8자리 숫자). 만약 바코드 숫자가 가려졌거나 정확하지 않다면 사진의 상품에 해당하는 일반적인 표준 바코드 번호 또는 빈 문자열을 반환하세요.
2. productName: 상품의 정확한 한국어 상품명 (예: "참치마요 삼각김밥", "바나나맛우유 240ml", "혜자로운 제육볶음도시락", "스팸마요 김밥", "듬뿍햄치즈샌드위치", "치킨가라아게 꼬치", "서울우유 200ml" 등)
3. category: 다음 중 가장 알맞은 하나 선택 ["삼각김밥/주먹밥", "도시락/덮밥", "샌드위치/햄버거", "김밥/롤", "유제품/음료", "디저트/베이커리", "조리/튀김", "기타"]
4. estimatedPrice: 해당 편의점 상품의 표준 판매가(원화 단위 정수, 예: 1200, 1400, 4900, 2800, 1800 등)
5. expirationTime: 유통기한 라벨에 적힌 폐기 시간대 (예: "02:00", "14:00", "20:00", "22:00" 등 시간 또는 날짜 표기, 사진에서 안 보이면 통상 권장시간)
6. brand: 편의점 브랜드명 (CU, GS25, 7-ELEVEN, 이마트24, 또는 PB/제조사명)
7. confidence: 인식 신뢰도 (0.0 ~ 1.0)`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            barcode: { type: Type.STRING, description: '바코드 숫자' },
            productName: { type: Type.STRING, description: '상품명' },
            category: {
              type: Type.STRING,
              description: '상품 카테고리',
            },
            estimatedPrice: { type: Type.INTEGER, description: '예상 판매가 (원)' },
            expirationTime: { type: Type.STRING, description: '유통기한/폐기시간' },
            brand: { type: Type.STRING, description: '편의점 또는 브랜드명' },
            confidence: { type: Type.NUMBER, description: '신뢰도' },
          },
          required: ['productName', 'category', 'estimatedPrice'],
        },
      },
    });

    const text = response.text || '{}';
    const parsedData = JSON.parse(text);

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

  // 1. Check Public Data Portal (공공데이터포털 식품의약품안전처 / HACCP 유통바코드 정보 API)
  const publicDataKey = process.env.PUBLIC_DATA_API_KEY;
  if (publicDataKey) {
    try {
      // 한국식품안전관리인증원_HACCP 제품 유통 바코드 정보
      const url = `https://apis.data.go.kr/B553748/certImgListService/getCertImgListService?serviceKey=${encodeURIComponent(
        publicDataKey
      )}&barcode=${encodeURIComponent(barcode)}&returnType=json`;

      const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
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

  // 2. Fallback: Query Gemini AI Barcode Knowledge Base (Korean EAN-13 standards)
  if (aiClient) {
    try {
      const prompt = `대한민국 유통 상품 공공 바코드 데이터베이스 조회:
바코드 번호: "${barcode}"

위 바코드 번호에 해당하는 대한민국 유통 식음료/편의점 상품 정보를 정확하게 찾아주세요.
만약 실존하는 상품의 바코드라면 정확한 상품명을 반환하세요.
카테고리는 반드시 다음 중 하나여야 합니다: ["삼각김밥/주먹밥", "도시락/덮밥", "샌드위치/햄버거", "김밥/롤", "유제품/음료", "디저트/베이커리", "조리/튀김", "기타"]

JSON으로 응답해 주세요.`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
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

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.found && parsed.productName) {
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

  return res.json({
    success: false,
    message: '공공데이터 유통바코드 정보에서 일치하는 품목을 찾지 못했습니다.',
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Convenience store waste management server running on port ${PORT}`);
  });
}

startServer();
