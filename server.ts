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

// API: AI Waste Analysis & Recommendation
app.post('/api/waste-insight', async (req, res) => {
  try {
    const { wasteLogs, month } = req.body;

    if (!aiClient) {
      return res.status(503).json({
        error: 'Gemini API 키가 필요합니다.',
      });
    }

    const summaryText = JSON.stringify(wasteLogs?.slice(0, 50) || []);

    const prompt = `당신은 대한민국 편의점 점포 운영 및 발주 최적화 전문 컨설턴트입니다.
점주님이 이번 달(${month || '최근'}) 발생한 폐기 내역을 바탕으로 발주 조정 및 폐기 손실을 최소화할 수 있는 조언을 구하고 있습니다.
폐기 데이터 샘플:
${summaryText}

다음을 분석하여 한국어로 3가지 핵심 포인트를 친절하고 실용적으로 요약해 주세요:
1. 가장 폐기 손실이 큰 품목군과 원인 분석
2. 폐기 발생 시간대/요일별 발주량 조절 권장 팁
3. 유통기한 임박 상품 할인(라스트오더/마감할인 등) 적용 추천 품목

JSON 형식으로 응답해 주세요.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: '한 줄 요약 브리핑' },
            topLossCategoryAnalysis: { type: Type.STRING, description: '최다 손실 카테고리 분석' },
            orderAdjustmentTip: { type: Type.STRING, description: '발주 최적화 가이드' },
            clearanceRecommendation: { type: Type.STRING, description: '마감할인/관리 추천' },
            estimatedSavingPercent: { type: Type.INTEGER, description: '예상 개선 절감률(%)' },
          },
          required: ['headline', 'topLossCategoryAnalysis', 'orderAdjustmentTip', 'clearanceRecommendation'],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return res.json({ success: true, insight: result });
  } catch (error: any) {
    console.error('Waste insight error:', error);
    return res.status(500).json({ error: error?.message || '분석 중 오류 발생' });
  }
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
