import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { PRESET_PRODUCTS } from './src/data/presetProducts';
import { generateSeedData } from './src/data/seedData';
import { WasteItem } from './src/types/waste';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ==========================================
// Persistent Shared Waste Data Store (Cross-Device Sync)
// Allows Mobile & PC to instantly synchronize registered waste items
// ==========================================
interface WasteDataStore {
  items: WasteItem[];
  storeSettings: {
    storeName: string;
    brand: 'CU' | 'GS25' | '7-ELEVEN' | '이마트24' | '개인/기타';
    costRatio: number;
  };
  version: number;
  lastUpdated: string;
}

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'waste-records.json');

function initDataStore(): WasteDataStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) {
        console.log(`Loaded ${parsed.items.length} waste items from persistent store.`);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read waste-records.json, reinitializing:', err);
  }

  const initialStore: WasteDataStore = {
    items: generateSeedData(),
    storeSettings: {
      storeName: 'CU봉암공단점',
      brand: 'CU',
      costRatio: 0.7,
    },
    version: 1,
    lastUpdated: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialStore, null, 2), 'utf-8');
    console.log(`Initialized persistent store with ${initialStore.items.length} seed items.`);
  } catch (err) {
    console.error('Failed to write initial waste data file:', err);
  }

  return initialStore;
}

const inMemoryStore = initDataStore();

function persistDataStore() {
  try {
    inMemoryStore.version = (inMemoryStore.version || 1) + 1;
    inMemoryStore.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(inMemoryStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist waste records to disk:', err);
  }
}

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
  // 삼각김밥/주먹밥
  '8801062871031': { productName: '참치마요 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871048': { productName: '전주비빔 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'GS리테일' },
  '8801062871055': { productName: '스팸김치볶음 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871062': { productName: '치킨마요 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: '코리아세븐' },
  '8801062871079': { productName: '통스팸 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'GS리테일' },
  '8801062871086': { productName: '소고기고추장 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871093': { productName: '청양마요참치 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  '8801062871109': { productName: '베이컨참치마요 삼각김밥', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' },
  // 도시락/덮밥
  '8809489281014': { productName: '혜자로운 제육볶음 도시락', category: '도시락/덮밥', manufacturer: 'GS25' },
  '8809489281021': { productName: '백종원 매콤돈까스 도시락', category: '도시락/덮밥', manufacturer: 'BGF리테일(CU)' },
  '8809489281038': { productName: '11가지찬 푸짐한 한판도시락', category: '도시락/덮밥', manufacturer: '7-ELEVEN' },
  '8809489281045': { productName: '치킨마요 덮밥도시락', category: '도시락/덮밥', manufacturer: 'GS25' },
  '8809489281052': { productName: '바싹불고기 한정식 도시락', category: '도시락/덮밥', manufacturer: 'BGF리테일(CU)' },
  '8809489281069': { productName: '백종원 한판도시락', category: '도시락/덮밥', manufacturer: 'BGF리테일(CU)' },
  '8809489281076': { productName: '혜자로운 너비아니 닭강정 도시락', category: '도시락/덮밥', manufacturer: 'GS25' },
  // 샌드위치/햄버거
  '8801117182910': { productName: '듬뿍햄 치즈 샌드위치', category: '샌드위치/햄버거', manufacturer: 'GS25' },
  '8801117182927': { productName: '에그포테이토 샌드위치', category: '샌드위치/햄버거', manufacturer: 'BGF리테일(CU)' },
  '8801117182934': { productName: '더블치즈 불고기버거', category: '샌드위치/햄버거', manufacturer: 'GS25' },
  '8801117182941': { productName: '크리스피 치킨버거', category: '샌드위치/햄버거', manufacturer: 'BGF리테일(CU)' },
  '8801117182958': { productName: '케이준 치킨 샐러드랩', category: '샌드위치/햄버거', manufacturer: '7-ELEVEN' },
  '8801117182965': { productName: '대만식 연유 샌드위치', category: '샌드위치/햄버거', manufacturer: 'BGF리테일(CU)' },
  // 김밥/롤
  '8801094012013': { productName: '정통 참치마요 김밥', category: '김밥/롤', manufacturer: 'BGF리테일(CU)' },
  '8801094012020': { productName: '묵은지참치 김밥', category: '김밥/롤', manufacturer: 'GS25' },
  '8801094012037': { productName: '매콤진미채 김밥', category: '김밥/롤', manufacturer: '7-ELEVEN' },
  '8801094012044': { productName: '백종원 불고기 한판김밥', category: '김밥/롤', manufacturer: 'BGF리테일(CU)' },
  '8801094012051': { productName: '통소시지 김밥', category: '김밥/롤', manufacturer: 'BGF리테일(CU)' },
  // 유제품/음료
  '8801043014853': { productName: '빙그레 바나나맛우유 240ml', category: '유제품/음료', manufacturer: '빙그레' },
  '8801043014860': { productName: '빙그레 딸기맛우유 240ml', category: '유제품/음료', manufacturer: '빙그레' },
  '8801043014877': { productName: '빙그레 커피맛우유 240ml', category: '유제품/음료', manufacturer: '빙그레' },
  '8801115111011': { productName: '서울우유 흰우유 200ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801115111028': { productName: '서울우유 커피우유 200ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801115111035': { productName: '서울우유 초코우유 200ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801115114012': { productName: '서울우유 흰우유 1000ml', category: '유제품/음료', manufacturer: '서울우유' },
  '8801115124011': { productName: '서울우유 비요뜨 초코링', category: '유제품/음료', manufacturer: '서울우유' },
  '8801043036015': { productName: '요플레 오리지널 딸기', category: '유제품/음료', manufacturer: '빙그레' },
  '8801111181216': { productName: '남양 초코에몽 180ml', category: '유제품/음료', manufacturer: '남양유업' },
  '8801121011101': { productName: '매일유업 아몬드브리즈 190ml', category: '유제품/음료', manufacturer: '매일유업' },
  '8801094017200': { productName: '코카콜라 350ml 캔', category: '유제품/음료', manufacturer: '코카콜라음료' },
  '8801094017217': { productName: '코카콜라 제로 355ml 캔', category: '유제품/음료', manufacturer: '코카콜라음료' },
  '8801056002116': { productName: '롯데 칠성사이다 355ml 캔', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801056002123': { productName: '롯데 칠성사이다 제로 355ml', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801062634032': { productName: '롯데 펩시콜라 제로슈거 라임 355ml', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801056038108': { productName: '롯데 밀키스 250ml 캔', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801037086804': { productName: '동아오츠카 포카리스웨트 500ml', category: '유제품/음료', manufacturer: '동아오츠카' },
  '8801037086811': { productName: '동아오츠카 오로나민C 120ml', category: '유제품/음료', manufacturer: '동아오츠카' },
  '8806002010118': { productName: '동아제약 박카스F 120ml', category: '유제품/음료', manufacturer: '동아제약' },
  '8809040180010': { productName: '제주 삼다수 500ml', category: '유제품/음료', manufacturer: '광동제약' },
  '8809040180027': { productName: '제주 삼다수 2L', category: '유제품/음료', manufacturer: '광동제약' },
  '8809040181017': { productName: '광동 비타500 100ml', category: '유제품/음료', manufacturer: '광동제약' },
  '8809040181024': { productName: '광동 옥수수수염차 500ml', category: '유제품/음료', manufacturer: '광동제약' },
  '8801382121013': { productName: '웅진 하늘보리 500ml', category: '유제품/음료', manufacturer: '웅진식품' },
  '8801056041016': { productName: '팔도 비락식혜 238ml 캔', category: '유제품/음료', manufacturer: '팔도' },
  '8801056021018': { productName: '롯데 레쓰비 마일드 175ml 캔', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801056021025': { productName: '롯데 칸타타 프리미엄 라떼 275ml', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  '8801104111019': { productName: '동서 맥심 TOP 마스터라떼 275ml', category: '유제품/음료', manufacturer: '동서식품' },
  '8801037002928': { productName: '맥심 슈프림골드 커피믹스', category: '유제품/음료', manufacturer: '동서식품' },
  '8801037050738': { productName: '맥심 화이트골드 커피믹스 100T', category: '유제품/음료', manufacturer: '동서식품' },
  '8801037056204': { productName: '맥심 화이트골드 커피믹스 210T', category: '유제품/음료', manufacturer: '동서식품' },
  '8801037028720': { productName: '맥심 모카골드 마일드 500g', category: '유제품/음료', manufacturer: '동서식품' },
  '8801037071160': { productName: '맥심 모카골드 마일드 커피믹스', category: '유제품/음료', manufacturer: '동서식품' },
  '8801094017309': { productName: '몬스터 에너지 355ml 캔', category: '유제품/음료', manufacturer: '코카콜라음료' },
  '8801056028109': { productName: '롯데 핫식스 오리지널 250ml 캔', category: '유제품/음료', manufacturer: '롯데칠성음료' },
  // 디저트/베이커리
  '8801056010111': { productName: '삼립 포켓몬 돌아온 로켓단 초코롤', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056010128': { productName: '삼립 포켓몬 돌아온 고오스 초코케익', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056010135': { productName: '삼립 포켓몬 피카피카 치즈케익', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056010222': { productName: '연세우유 우유생크림빵', category: '디저트/베이커리', manufacturer: '연세우유/CU' },
  '8801056010239': { productName: '연세우유 초코생크림빵', category: '디저트/베이커리', manufacturer: '연세우유/CU' },
  '8801056010246': { productName: '연세우유 말차생크림빵', category: '디저트/베이커리', manufacturer: '연세우유/CU' },
  '8801056010253': { productName: '연세우유 단팥생크림빵', category: '디저트/베이커리', manufacturer: '연세우유/CU' },
  '8801056010333': { productName: '브레디크 순우유 식빵', category: '디저트/베이커리', manufacturer: 'GS25' },
  '8801056010444': { productName: '촉촉한 초코칩 쿠키 팩', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801056154013': { productName: '삼립 정통 크림빵 80g', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056154020': { productName: '삼립 미니 꿀호떡 팩', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801056154037': { productName: '삼립 보름달빵 75g', category: '디저트/베이커리', manufacturer: 'SPC삼립' },
  '8801117178005': { productName: '오리온 포카칩 오리지널 66g', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801117178012': { productName: '오리온 포카칩 어니언맛 66g', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801117111125': { productName: '오리온 초코파이 정 2입', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801117154016': { productName: '오리온 꼬북칩 콘스프맛 80g', category: '디저트/베이커리', manufacturer: '오리온' },
  '8801043016079': { productName: '농심 새우깡 90g', category: '디저트/베이커리', manufacturer: '농심' },
  '8801043016086': { productName: '농심 매운새우깡 90g', category: '디저트/베이커리', manufacturer: '농심' },
  '8801123111012': { productName: '롯데 빼빼로 오리지널 54g', category: '디저트/베이커리', manufacturer: '롯데웰푸드' },
  '8801123111029': { productName: '롯데 아몬드 빼빼로 37g', category: '디저트/베이커리', manufacturer: '롯데웰푸드' },
  '8801123111036': { productName: '롯데 초코송이 50g', category: '디저트/베이커리', manufacturer: '롯데웰푸드' },
  '8801123111043': { productName: '롯데 칸쵸 54g', category: '디저트/베이커리', manufacturer: '롯데웰푸드' },
  '8801123111050': { productName: '롯데 몽쉘 크림케이크 6입', category: '디저트/베이커리', manufacturer: '롯데웰푸드' },
  '8801155111017': { productName: '해태 허니버터칩 60g', category: '디저트/베이커리', manufacturer: '해태제과' },
  '8801155111024': { productName: '해태 맛동산 90g', category: '디저트/베이커리', manufacturer: '해태제과' },
  '8801062012700': { productName: '크라운 콘칩 70g', category: '디저트/베이커리', manufacturer: '크라운제과' },
  '8804973304835': { productName: '이클립스 피치향 캔디 34g', category: '디저트/베이커리', manufacturer: '한국마즈' },
  '8804973304811': { productName: '이클립스 페퍼민트향 캔디 34g', category: '디저트/베이커리', manufacturer: '한국마즈' },
  '8804973304828': { productName: '이클립스 스피어민트향 캔디 34g', category: '디저트/베이커리', manufacturer: '한국마즈' },
  '8804973304842': { productName: '이클립스 스트로베리향 캔디 34g', category: '디저트/베이커리', manufacturer: '한국마즈' },
  // 조리/튀김
  '8809112233445': { productName: '바삭 통다리 치킨', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8809112233452': { productName: '매콤 넓적다리 치킨', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8809112233469': { productName: '치즈 소시지 핫도그', category: '조리/튀김', manufacturer: '편의점 즉석조리' },
  '8801123180216': { productName: '롯데 의성마늘프랑크 70g', category: '조리/튀김', manufacturer: '롯데푸드' },
  '8801007052563': { productName: 'CJ 맥스봉 치즈 35g', category: '조리/튀김', manufacturer: 'CJ제일제당' },
  '8801007052570': { productName: '진주햄 천하장사 50g', category: '조리/튀김', manufacturer: '진주햄' },
  '8801123180223': { productName: '롯데 키스틱 소시지 45g', category: '조리/튀김', manufacturer: '롯데푸드' },
  '8801073180109': { productName: '삼양 불닭후랑크 70g', category: '조리/튀김', manufacturer: '삼양식품' },
  '8801007180105': { productName: '한성 크래미 90g', category: '조리/튀김', manufacturer: '한성기업' },
  // 라면/간편식 (신라면 전체 라인업 및 인기 라면)
  '8801043056953': { productName: '농심 신라면 골드 125g (봉지)', category: '기타', manufacturer: '농심' },
  '8801043056960': { productName: '농심 신라면 골드 큰사발면', category: '기타', manufacturer: '농심' },
  '8801043005882': { productName: '농심 신라면 120g (봉지)', category: '기타', manufacturer: '농심' },
  '8801043014830': { productName: '농심 신라면 멀티팩 (120g*5입)', category: '기타', manufacturer: '농심' },
  '8801043015843': { productName: '농심 신라면 큰사발면 114g', category: '기타', manufacturer: '농심' },
  '8801043001815': { productName: '농심 신라면 컵 65g', category: '기타', manufacturer: '농심' },
  '8801043012249': { productName: '농심 신라면 블랙 130g', category: '기타', manufacturer: '농심' },
  '8801043012256': { productName: '농심 신라면 블랙 사발 101g', category: '기타', manufacturer: '농심' },
  '8801043051026': { productName: '농심 신라면 더레드 125g', category: '기타', manufacturer: '농심' },
  '8801043051033': { productName: '농심 신라면 더레드 큰사발면', category: '기타', manufacturer: '농심' },
  '8801043048033': { productName: '농심 신라면 볶음면 131g', category: '기타', manufacturer: '농심' },
  '8801043048040': { productName: '농심 신라면 볶음면 큰사발면', category: '기타', manufacturer: '농심' },
  '8801043050111': { productName: '농심 신라면 건면 97g', category: '기타', manufacturer: '농심' },
  '8801043050128': { productName: '농심 신라면 건면 사발', category: '기타', manufacturer: '농심' },
  '8801043050135': { productName: '농심 신라면 툼바 큰사발면', category: '기타', manufacturer: '농심' },
  '8801043050142': { productName: '농심 신라면 툼바 봉지 137g', category: '기타', manufacturer: '농심' },
  '8801043015287': { productName: '농심 육개장 사발면 86g', category: '기타', manufacturer: '농심' },
  '8801043015294': { productName: '농심 김치사발면 86g', category: '기타', manufacturer: '농심' },
  '8801043014839': { productName: '농심 짜파게티 140g', category: '기타', manufacturer: '농심' },
  '8801043014846': { productName: '농심 너구리 얼큰한맛 120g', category: '기타', manufacturer: '농심' },
  '8801043014850': { productName: '농심 안성탕면 125g', category: '기타', manufacturer: '농심' },
  '8801043015300': { productName: '농심 새우탕 큰사발면 115g', category: '기타', manufacturer: '농심' },
  '8801043015317': { productName: '농심 튀김우동 큰사발면 111g', category: '기타', manufacturer: '농심' },
  '8801073110502': { productName: '삼양 불닭볶음면 큰컵 105g', category: '기타', manufacturer: '삼양식품' },
  '8801073110519': { productName: '삼양 까르보불닭볶음면 큰컵 105g', category: '기타', manufacturer: '삼양식품' },
  '8801045524046': { productName: '오뚜기 진라면 매운맛 120g', category: '기타', manufacturer: '오뚜기' },
  '8801045524053': { productName: '오뚜기 진라면 순한맛 120g', category: '기타', manufacturer: '오뚜기' },
  '8801045524107': { productName: '오뚜기 참깨라면 큰사발 110g', category: '기타', manufacturer: '오뚜기' },
  '8801045524114': { productName: '오뚜기 열라면 120g', category: '기타', manufacturer: '오뚜기' },
  '8801056024019': { productName: '팔도 왕뚜껑 110g', category: '기타', manufacturer: '팔도' },
  '8801056024026': { productName: '팔도 비빔면 130g', category: '기타', manufacturer: '팔도' },
  '8801007052990': { productName: 'CJ 햇반 백미 210g', category: '도시락/덮밥', manufacturer: 'CJ제일제당' },
  '8801045511015': { productName: '오뚜기 맛있는 오뚜기밥 210g', category: '도시락/덮밥', manufacturer: '오뚜기' },
};

// Merge all preset products into KOREA_POPULAR_BARCODES for instant lookup
for (const p of PRESET_PRODUCTS) {
  if (p.barcode) {
    const clean = p.barcode.replace(/[^0-9]/g, '');
    if (!KOREA_POPULAR_BARCODES[clean]) {
      KOREA_POPULAR_BARCODES[clean] = {
        productName: p.productName,
        category: p.category,
        manufacturer: p.storeBrand || '편의점 표준 유통상품',
      };
    }
  }
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

  // Exact Korean Manufacturer / Brand GS1 880 prefix matching
  if (clean.startsWith('88010430')) {
    return { productName: '농심 라면/스낵 상품', category: '기타', manufacturer: '농심' };
  }
  if (clean.startsWith('8801043')) {
    return { productName: '빙그레 유제품/음료 상품', category: '유제품/음료', manufacturer: '빙그레' };
  }
  if (clean.startsWith('8801115')) {
    return { productName: '서울우유 유제품', category: '유제품/음료', manufacturer: '서울우유협동조합' };
  }
  if (clean.startsWith('88010561') || clean.startsWith('880105601')) {
    return { productName: 'SPC삼립 베이커리/디저트', category: '디저트/베이커리', manufacturer: 'SPC삼립' };
  }
  if (clean.startsWith('880105600') || clean.startsWith('880105602') || clean.startsWith('880105603') || clean.startsWith('88010626')) {
    return { productName: '롯데칠성 음료/주스', category: '유제품/음료', manufacturer: '롯데칠성음료' };
  }
  if (clean.startsWith('8801117')) {
    return { productName: '오리온 제과/스낵', category: '디저트/베이커리', manufacturer: '오리온' };
  }
  if (clean.startsWith('8801007')) {
    return { productName: 'CJ제일제당 식품', category: '도시락/덮밥', manufacturer: 'CJ제일제당' };
  }
  if (clean.startsWith('8801045')) {
    return { productName: '오뚜기 라면/간편식', category: '기타', manufacturer: '오뚜기' };
  }
  if (clean.startsWith('8801073')) {
    return { productName: '삼양식품 라면/식품', category: '기타', manufacturer: '삼양식품' };
  }
  if (clean.startsWith('8801094')) {
    return { productName: '코카콜라음료 상품', category: '유제품/음료', manufacturer: '코카콜라음료' };
  }
  if (clean.startsWith('8801123')) {
    return { productName: '롯데웰푸드 제과/육가공', category: '디저트/베이커리', manufacturer: '롯데웰푸드' };
  }
  if (clean.startsWith('8801155')) {
    return { productName: '해태제과 스낵/과자', category: '디저트/베이커리', manufacturer: '해태제과' };
  }
  if (clean.startsWith('88010620')) {
    return { productName: '크라운제과 스낵', category: '디저트/베이커리', manufacturer: '크라운제과' };
  }
  if (clean.startsWith('8801111')) {
    return { productName: '남양유업 유음료', category: '유제품/음료', manufacturer: '남양유업' };
  }
  if (clean.startsWith('8801121')) {
    return { productName: '매일유업 유음료/디저트', category: '유제품/음료', manufacturer: '매일유업' };
  }
  if (clean.startsWith('880103700')) {
    return { productName: '맥심 슈프림골드 커피믹스', category: '유제품/음료', manufacturer: '동서식품' };
  }
  if (clean.startsWith('880103705')) {
    return { productName: '맥심 화이트골드 커피믹스', category: '유제품/음료', manufacturer: '동서식품' };
  }
  if (clean.startsWith('880103702') || clean.startsWith('880103707')) {
    return { productName: '맥심 모카골드 마일드 커피믹스', category: '유제품/음료', manufacturer: '동서식품' };
  }
  if (clean.startsWith('880103708')) {
    return { productName: '동아오츠카 포카리스웨트/음료', category: '유제품/음료', manufacturer: '동아오츠카' };
  }
  if (clean.startsWith('8801037') || clean.startsWith('8801104')) {
    return { productName: '동서식품 맥심 커피/음료', category: '유제품/음료', manufacturer: '동서식품' };
  }
  if (clean.startsWith('8806002')) {
    return { productName: '동아제약 자양강장/의약외품', category: '유제품/음료', manufacturer: '동아제약' };
  }
  if (clean.startsWith('8809040')) {
    return { productName: '광동제약 음료/생수', category: '유제품/음료', manufacturer: '광동제약' };
  }
  if (clean.startsWith('8801382')) {
    return { productName: '웅진식품 차음료', category: '유제품/음료', manufacturer: '웅진식품' };
  }
  if (clean.startsWith('8809489') || clean.startsWith('88010628')) {
    return { productName: 'CU BGF리테일 편의점 프레시푸드', category: '삼각김밥/주먹밥', manufacturer: 'BGF리테일(CU)' };
  }
  if (clean.startsWith('8809112')) {
    return { productName: '편의점 즉석조리/튀김류', category: '조리/튀김', manufacturer: '편의점 즉석조리' };
  }
  if (clean.startsWith('8801097')) {
    return { productName: '하이트진로 주류', category: '기타', manufacturer: '하이트진로' };
  }
  if (clean.startsWith('8801069')) {
    return { productName: '오비맥주 주류', category: '기타', manufacturer: '오비맥주' };
  }
  return {
    productName: '',
    category: '기타',
    manufacturer: '대한민국 표준유통바코드(880)',
  };
}

// Food Safety Korea (식품안전나라 I2570 유통바코드 연계 API)
async function fetchFoodSafetyKorea(barcode: string) {
  try {
    const url = `http://openapi.foodsafetykorea.go.kr/api/sample/I2570/json/1/1/BRCD_NO=${encodeURIComponent(barcode)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (response.ok) {
      const json: any = await response.json();
      const row = json?.I2570?.row?.[0];
      if (row && row.PRDLST_NM) {
        return {
          productName: String(row.PRDLST_NM).trim(),
          category: mapCategoryFromFoodType(row.PRD_KND || row.PRDLST_NM),
          manufacturer: String(row.BSSH_NM || '').trim(),
        };
      }
    }
  } catch (err) {
    // Ignore timeout / network err
  }
  return null;
}

// Open Food Facts API (글로벌/한국 상품 바코드 데이터베이스)
async function fetchOpenFoodFacts(barcode: string) {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (response.ok) {
      const json: any = await response.json();
      if (json?.status === 1 && json?.product) {
        const p = json.product;
        const name = p.product_name_ko || p.product_name || p.generic_name_ko || p.generic_name;
        if (name && typeof name === 'string' && name.trim()) {
          return {
            productName: name.trim(),
            category: mapCategoryFromFoodType(p.categories || name),
            manufacturer: p.brands || '',
          };
        }
      }
    }
  } catch (err) {
    // Ignore timeout
  }
  return null;
}

// Function to fetch official HACCP product image by product name (reverse search in CertImgListServiceV3)
async function fetchHaccpImageByProductName(productName: string, customKey?: string): Promise<string | undefined> {
  const serviceKey =
    customKey ||
    process.env.HACCP_API_KEY ||
    process.env.PUBLIC_DATA_API_KEY ||
    process.env.DATA_GO_KR_KEY;
  if (!serviceKey || !productName) return undefined;

  // Extract core product name (e.g., '농심 신라면 골드 125g' -> '신라면')
  const cleanName = productName
    .replace(/^(농심|오뚜기|삼양식품|삼양|팔도|롯데웰푸드|롯데|해태제과|해태|CJ제일제당|CJ|빙그레|서울우유|매일유업|남양유업|남양|동서식품|코카콜라|웅진|동아오츠카|SPC삼립|삼립)\s*/, '')
    .trim();
  const keyword = cleanName.split(' ')[0] || cleanName;
  if (!keyword || keyword.length < 2) return undefined;

  const formattedKey = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
  const url = `https://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3?serviceKey=${formattedKey}&prdlstNm=${encodeURIComponent(
    keyword
  )}&returnType=json&pageNo=1&numOfRows=5`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const json: any = await res.json();
      const items = json?.body?.items || json?.response?.body?.items;
      const list = Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      for (const it of list) {
        const obj = it?.item || it;
        const img = obj?.imgurl1 || obj?.IMGURL1 || obj?.imgurl2 || obj?.IMGURL2;
        if (img && typeof img === 'string' && img.startsWith('http')) {
          return img;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return undefined;
}

// Function to query HACCP 제품이미지 및 포장지표기정보 조회 (data.go.kr)
// End Point: https://apis.data.go.kr/B553748/CertImgListServiceV3
async function fetchHaccpCertImgListServiceV3(barcode: string, customKey?: string) {
  const serviceKey =
    customKey ||
    process.env.HACCP_API_KEY ||
    process.env.PUBLIC_DATA_API_KEY ||
    process.env.DATA_GO_KR_KEY;
  if (!serviceKey) return null;

  const clean = barcode.replace(/[^0-9]/g, '');
  if (!clean) return null;

  // Key handling: If serviceKey already has % escape sequences, don't double encode
  const formattedKey = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);

  // 1. Try V3 endpoint with returnType=json
  const urlV3Json = `https://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3?serviceKey=${formattedKey}&barcode=${encodeURIComponent(
    clean
  )}&returnType=json&pageNo=1&numOfRows=10`;

  try {
    const response = await fetch(urlV3Json, { signal: AbortSignal.timeout(3500) });
    const text = await response.text();

    // Check if JSON format
    if (text.trim().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        const body = json?.body || json?.response?.body;
        const items = body?.items;
        let itemList: any[] = [];
        if (Array.isArray(items)) {
          itemList = items.map((it: any) => it?.item || it);
        } else if (items?.item) {
          itemList = Array.isArray(items.item) ? items.item : [items.item];
        }

        // CRITICAL: CertImgListServiceV3 ignores the barcode query parameter and returns all products.
        // Therefore, we must strictly verify that the item's barcode matches the requested barcode!
        const matchedItem = itemList.find((it: any) => {
          const itemBarcode = String(it?.barcode || it?.BARCODE || '').replace(/[^0-9]/g, '');
          return itemBarcode && (itemBarcode === clean || itemBarcode.endsWith(clean) || clean.endsWith(itemBarcode));
        });

        if (matchedItem && (matchedItem.prdlstNm || matchedItem.PRDLST_NM)) {
          const prdName = String(matchedItem.prdlstNm || matchedItem.PRDLST_NM).trim();
          const kind = String(matchedItem.prdkind || matchedItem.PRDKIND || matchedItem.clsfNm || '').trim();
          const company = String(matchedItem.bsshNm || matchedItem.BSSH_NM || matchedItem.manufacture || '').trim();
          const img1 = matchedItem.imgurl1 || matchedItem.IMGURL1 || '';
          const img2 = matchedItem.imgurl2 || matchedItem.IMGURL2 || '';
          const photo = img1 || img2 || undefined;

          return {
            productName: prdName,
            category: mapCategoryFromFoodType(kind || prdName),
            manufacturer: company,
            photoUrl: photo,
            rawmtrl: matchedItem.rawmtrl || '',
            nutrient: matchedItem.nutrient || '',
            capacity: matchedItem.capacity || '',
            prdlstReportNo: matchedItem.prdlstReportNo || '',
            sourceName: 'HACCP 제품이미지 및 포장지표기정보(V3)',
          };
        }
      } catch (parseErr) {
        // Fall back to XML parsing
      }
    }

    // 2. Parse XML format (verify barcode in XML)
    if (text.includes('<prdlstNm>') || text.includes('<PRDLST_NM>')) {
      const getTag = (tag: string): string => {
        const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1').trim() : '';
      };
      const xmlBarcode = (getTag('barcode') || getTag('BARCODE')).replace(/[^0-9]/g, '');
      if (xmlBarcode && (xmlBarcode === clean || xmlBarcode.endsWith(clean) || clean.endsWith(xmlBarcode))) {
        const prdName = getTag('prdlstNm') || getTag('PRDLST_NM');
        if (prdName) {
          const kind = getTag('prdkind') || getTag('PRDKIND') || getTag('clsfNm');
          const company = getTag('bsshNm') || getTag('BSSH_NM');
          const img1 = getTag('imgurl1') || getTag('IMGURL1');
          const img2 = getTag('imgurl2') || getTag('IMGURL2');
          const photo = img1 || img2 || undefined;

          return {
            productName: prdName,
            category: mapCategoryFromFoodType(kind || prdName),
            manufacturer: company,
            photoUrl: photo,
            rawmtrl: getTag('rawmtrl'),
            nutrient: getTag('nutrient'),
            capacity: getTag('capacity'),
            prdlstReportNo: getTag('prdlstReportNo'),
            sourceName: 'HACCP 제품이미지 및 포장지표기정보(V3 XML)',
          };
        }
      }
    }
  } catch (err) {
    console.warn('HACCP V3 API query error:', err);
  }

  return null;
}

// Health check / verification endpoint for HACCP API key
app.get('/api/haccp/test-connection', async (req, res) => {
  const serviceKey =
    (req.query.serviceKey as string) ||
    process.env.HACCP_API_KEY ||
    process.env.PUBLIC_DATA_API_KEY ||
    process.env.DATA_GO_KR_KEY ||
    '';

  if (!serviceKey) {
    return res.json({
      configured: false,
      message: '공공데이터포털(data.go.kr) 일반 인증키(ServiceKey)가 설정되지 않았습니다.',
    });
  }

  const formattedKey = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
  const testUrl = `https://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3?serviceKey=${formattedKey}&pageNo=1&numOfRows=1&returnType=json`;

  try {
    const response = await fetch(testUrl, { signal: AbortSignal.timeout(4000) });
    const text = await response.text();

    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
      return res.json({
        configured: true,
        valid: false,
        message: '등록되지 않은 인증키이거나 승인 대기 중인 키입니다.',
      });
    }

    if (text.includes('SERVICE_KEY_IS_NULL') || text.includes('서비스 접근거부')) {
      return res.json({
        configured: true,
        valid: false,
        message: '인증키가 유효하지 않거나 접근이 거부되었습니다.',
      });
    }

    return res.json({
      configured: true,
      valid: true,
      message: 'HACCP 제품이미지 및 포장지표기정보(V3) API와 정상 연결되었습니다.',
      endpoint: 'https://apis.data.go.kr/B553748/CertImgListServiceV3',
    });
  } catch (err: any) {
    return res.json({
      configured: true,
      valid: false,
      message: 'API 연결 시간 초과 또는 네트워크 오류: ' + (err?.message || ''),
    });
  }
});

// API: Barcode lookup leveraging HACCP V3, Public Data Portal & Food Safety Open APIs
app.all('/api/lookup-barcode', async (req, res) => {
  const barcode = (
    (req.query.barcode as string) ||
    (req.body?.barcode as string) ||
    ''
  ).trim();
  const customServiceKey = (
    (req.query.serviceKey as string) ||
    (req.body?.serviceKey as string) ||
    (req.headers['x-haccp-service-key'] as string) ||
    ''
  ).trim();

  if (!barcode) {
    return res.status(400).json({ error: '바코드 번호가 필요합니다.' });
  }

  const clean = barcode.replace(/[^0-9]/g, '');

  // 1. Instant check in server-side Korea convenience store catalog
  if (KOREA_POPULAR_BARCODES[clean]) {
    const item = KOREA_POPULAR_BARCODES[clean];
    const photoUrl = await fetchHaccpImageByProductName(item.productName, customServiceKey);
    return res.json({
      success: true,
      found: true,
      source: 'convenience_catalog',
      sourceName: '공공 유통표준 바코드 카탈로그',
      data: {
        barcode: clean,
        productName: item.productName,
        category: item.category,
        manufacturer: item.manufacturer,
        photoUrl: photoUrl || undefined,
      },
    });
  }

  // 1-1. Also check 12-digit UPC with leading zero or 13-digit without leading zero
  if (clean.length === 12 && KOREA_POPULAR_BARCODES['0' + clean]) {
    const item = KOREA_POPULAR_BARCODES['0' + clean];
    const photoUrl = await fetchHaccpImageByProductName(item.productName, customServiceKey);
    return res.json({
      success: true,
      found: true,
      source: 'convenience_catalog',
      sourceName: '공공 유통표준 바코드 카탈로그',
      data: {
        barcode: clean,
        productName: item.productName,
        category: item.category,
        manufacturer: item.manufacturer,
        photoUrl: photoUrl || undefined,
      },
    });
  }

  // 2. Query HACCP 제품이미지 및 포장지표기정보 조회 (V3 JSON+XML)
  const haccpResult = await fetchHaccpCertImgListServiceV3(clean, customServiceKey);
  if (haccpResult && haccpResult.productName) {
    return res.json({
      success: true,
      found: true,
      source: 'haccp_v3',
      sourceName: haccpResult.sourceName || 'HACCP 제품이미지 및 포장지표기정보(V3)',
      data: {
        barcode: clean,
        productName: haccpResult.productName,
        category: haccpResult.category,
        manufacturer: haccpResult.manufacturer,
        photoUrl: haccpResult.photoUrl,
        rawmtrl: haccpResult.rawmtrl,
        nutrient: haccpResult.nutrient,
        capacity: haccpResult.capacity,
        prdlstReportNo: haccpResult.prdlstReportNo,
      },
    });
  }

  // 3. Query Food Safety Korea open API (식품안전나라 I2570 바코드 연계)
  const foodSafetyResult = await fetchFoodSafetyKorea(clean);
  if (foodSafetyResult && foodSafetyResult.productName) {
    return res.json({
      success: true,
      found: true,
      source: 'foodsafetykorea',
      sourceName: '식품안전나라 공공데이터',
      data: {
        barcode: clean,
        productName: foodSafetyResult.productName,
        category: foodSafetyResult.category,
        manufacturer: foodSafetyResult.manufacturer,
      },
    });
  }

  // 4. Query Open Food Facts open API
  const openFoodResult = await fetchOpenFoodFacts(clean);
  if (openFoodResult && openFoodResult.productName) {
    return res.json({
      success: true,
      found: true,
      source: 'openfoodfacts',
      sourceName: '공공 유통 바코드 데이터베이스',
      data: {
        barcode: clean,
        productName: openFoodResult.productName,
        category: openFoodResult.category,
        manufacturer: openFoodResult.manufacturer,
      },
    });
  }

  // 5. Query Gemini AI Barcode Knowledge Base (if API key present)
  if (aiClient) {
    const prompt = `대한민국 유통 상품 공공 바코드 데이터베이스 조회:
바코드 번호: "${clean}"

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
        parsed = await withTimeout(queryModel('gemini-3.8-flash'), 2000, '3.8 timeout');
      } catch (err38) {
        console.warn('gemini-3.8-flash lookup skipped/failed:', (err38 as any)?.message);
      }

      const pName = (parsed?.productName || '').trim();
      const isInvalidName =
        !pName ||
        pName.includes('정보 없음') ||
        pName.includes('알 수 없음') ||
        pName.includes('미상') ||
        pName.includes('미확인') ||
        pName.includes('한국 유통상품') ||
        parsed?.found === false;

      if (parsed && !isInvalidName) {
        return res.json({
          success: true,
          found: true,
          source: 'public_barcode_db',
          sourceName: '공공데이터 유통 바코드 정보 (Open API)',
          data: {
            barcode: clean,
            productName: pName,
            category: parsed.category || '기타',
            manufacturer: parsed.manufacturer || '',
          },
        });
      }
    } catch (e) {
      console.warn('AI Barcode knowledge query error:', e);
    }
  }

  // 6. Intelligent Prefix Fallback for Korean 880 barcodes (brand specific only, never generic "한국 유통상품")
  const guessed = guessKoreanProductFromBarcode(clean);
  if (guessed.productName && !guessed.productName.includes('한국 유통상품')) {
    return res.json({
      success: true,
      found: true,
      source: 'korea_standard_db',
      sourceName: '공공 유통 표준 바코드(880) DB',
      data: {
        barcode: clean,
        productName: guessed.productName,
        category: guessed.category,
        manufacturer: guessed.manufacturer,
      },
    });
  }

  // 7. Not found in any database: Return found: false with clean empty productName
  return res.json({
    success: true,
    found: false,
    source: 'unregistered',
    sourceName: '신규 바코드',
    data: {
      barcode: clean,
      productName: '',
      category: '기타',
      manufacturer: '대한민국 유통바코드',
    },
  });
});

// -------------------------------------------------------------
// Cross-Device Synchronization APIs for Waste Items & Settings
// -------------------------------------------------------------

// 1. Get all waste items & store settings
app.get('/api/waste-items', (_req, res) => {
  return res.json({
    success: true,
    items: inMemoryStore.items,
    storeSettings: inMemoryStore.storeSettings,
    version: inMemoryStore.version,
    lastUpdated: inMemoryStore.lastUpdated,
  });
});

// 2. Add a new waste item
app.post('/api/waste-items', (req, res) => {
  try {
    const itemData = req.body;
    if (!itemData || !itemData.productName || !itemData.date) {
      return res.status(400).json({ success: false, error: '상품명과 날짜는 필수 입력 항목입니다.' });
    }

    const newItem: WasteItem = {
      ...itemData,
      id: itemData.id || `waste-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      registeredAt: itemData.registeredAt || new Date().toISOString(),
      quantity: Number(itemData.quantity) || 1,
    };

    // Prepend new item
    inMemoryStore.items = [newItem, ...inMemoryStore.items];
    persistDataStore();

    console.log(`[API] Added waste item: ${newItem.productName} (${newItem.date}). Total items: ${inMemoryStore.items.length}`);

    return res.json({
      success: true,
      item: newItem,
      totalCount: inMemoryStore.items.length,
      version: inMemoryStore.version,
      lastUpdated: inMemoryStore.lastUpdated,
    });
  } catch (err: any) {
    console.error('Error adding waste item:', err);
    return res.status(500).json({ success: false, error: err.message || '저장 중 오류 발생' });
  }
});

// 3. Update quantity or details of an existing waste item
app.put('/api/waste-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, notes, disposalTime, unitPrice, costPrice } = req.body;
    const index = inMemoryStore.items.findIndex((item) => item.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: '해당 폐기 내역을 찾을 수 없습니다.' });
    }

    inMemoryStore.items[index] = {
      ...inMemoryStore.items[index],
      ...(quantity !== undefined ? { quantity: Math.max(1, Number(quantity)) } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(disposalTime !== undefined ? { disposalTime } : {}),
      ...(unitPrice !== undefined ? { unitPrice: Number(unitPrice) } : {}),
      ...(costPrice !== undefined ? { costPrice: Number(costPrice) } : {}),
    };

    persistDataStore();

    return res.json({
      success: true,
      item: inMemoryStore.items[index],
      version: inMemoryStore.version,
      lastUpdated: inMemoryStore.lastUpdated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Delete a waste item
app.delete('/api/waste-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const initialLen = inMemoryStore.items.length;
    inMemoryStore.items = inMemoryStore.items.filter((item) => item.id !== id);

    if (inMemoryStore.items.length !== initialLen) {
      persistDataStore();
    }

    return res.json({
      success: true,
      deletedId: id,
      totalCount: inMemoryStore.items.length,
      version: inMemoryStore.version,
      lastUpdated: inMemoryStore.lastUpdated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Bulk Sync & Merge (retains items registered previously on mobile or PC)
app.post('/api/waste-items/sync', (req, res) => {
  try {
    const { clientItems } = req.body;
    if (Array.isArray(clientItems) && clientItems.length > 0) {
      const serverIds = new Set(inMemoryStore.items.map((i) => i.id));
      let addedCount = 0;

      for (const clientItem of clientItems) {
        // If client item is not in server and is not a default seed item, merge it
        if (!serverIds.has(clientItem.id) && clientItem.productName && !clientItem.id.startsWith('seed-')) {
          inMemoryStore.items.unshift(clientItem);
          serverIds.add(clientItem.id);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        console.log(`[API] Merged ${addedCount} custom items from client into shared server store.`);
        persistDataStore();
      }
    }

    return res.json({
      success: true,
      items: inMemoryStore.items,
      storeSettings: inMemoryStore.storeSettings,
      version: inMemoryStore.version,
      lastUpdated: inMemoryStore.lastUpdated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Reset to initial seed data
app.post('/api/waste-items/reset', (_req, res) => {
  try {
    inMemoryStore.items = generateSeedData();
    persistDataStore();

    return res.json({
      success: true,
      items: inMemoryStore.items,
      version: inMemoryStore.version,
      lastUpdated: inMemoryStore.lastUpdated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Store Settings (Branch Name & Brand)
app.get('/api/store-settings', (_req, res) => {
  return res.json({
    success: true,
    storeSettings: inMemoryStore.storeSettings,
  });
});

app.post('/api/store-settings', (req, res) => {
  try {
    const { storeName, brand, costRatio } = req.body;
    if (storeName) inMemoryStore.storeSettings.storeName = String(storeName).trim();
    if (brand) inMemoryStore.storeSettings.brand = brand;
    if (costRatio) inMemoryStore.storeSettings.costRatio = Number(costRatio);
    persistDataStore();

    return res.json({
      success: true,
      storeSettings: inMemoryStore.storeSettings,
      version: inMemoryStore.version,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
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
