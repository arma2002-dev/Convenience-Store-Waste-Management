import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Scan,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { WasteItem, WasteCategory, DisposalReason } from '../types/waste';
import {
  decodeBarcodeFromImage,
  fileToBase64,
  findPresetProductByBarcode,
  scanBarcodeWithAI,
  lookupBarcodeFromPublicAPI,
} from '../utils/barcodeScanner';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<WasteItem, 'id' | 'registeredAt'>) => void;
  initialDate?: string;
  initialTimeSlot?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialDate,
  initialTimeSlot,
}) => {
  // Form states
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<WasteCategory>('삼각김밥/주먹밥');
  const [quantity, setQuantity] = useState<number>(1);
  const [disposalDate, setDisposalDate] = useState<string>(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<DisposalReason>('유통기한 경과');
  const [notes, setNotes] = useState('');
  const [scannedPhotoPreview, setScannedPhotoPreview] = useState<string | null>(null);

  // Scanner states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productNameInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const hasDetectedRef = useRef<boolean>(false);

  // Sync date when modal opens with initialDate
  useEffect(() => {
    if (isOpen) {
      if (initialDate) setDisposalDate(initialDate);
      setScanSuccessMessage(null);
      setCameraError(null);
      hasDetectedRef.current = false;
    } else {
      stopCamera();
    }
  }, [isOpen, initialDate]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);

  // Query product data from Public Data Portal / Food Safety Open API / Preset Database
  const fetchBarcodePublicInfo = async (code: string) => {
    const clean = code.replace(/[\s-]/g, '');
    if (!clean || clean.length < 5) return;

    // 1. Instant local preset catalog match (zero latency)
    const localMatch = findPresetProductByBarcode(clean);
    if (localMatch) {
      setProductName(localMatch.productName);
      if (localMatch.category) setCategory(localMatch.category);
      setScanSuccessMessage(`[공공 유통 카탈로그] "${localMatch.productName}" 자동 매칭 완료!`);
      playSuccessChime();
      return;
    }

    setIsLookingUpBarcode(true);
    setScanSuccessMessage('공공데이터 유통 바코드 조회 중...');
    try {
      const info = await lookupBarcodeFromPublicAPI(clean);
      if (info && info.productName && !info.productName.includes('한국 유통상품')) {
        setProductName(info.productName);
        if (info.category) {
          setCategory(info.category);
        }
        setScanSuccessMessage(
          `[${info.sourceName || '공공 유통데이터'}] "${info.productName}" 자동 조회 완료!`
        );
        playSuccessChime();
      } else {
        // Do NOT pre-fill robotic "한국 유통상품"! Keep clean so user can enter easily
        setProductName('');
        setScanSuccessMessage(`바코드 [${clean}] 인식 완료! 상품명을 입력해 주세요.`);
        setTimeout(() => productNameInputRef.current?.focus(), 150);
      }
    } catch (e) {
      console.warn('Barcode lookup failed:', e);
      setProductName('');
      setScanSuccessMessage(`바코드 [${clean}] 인식 완료! 상품명을 입력해 주세요.`);
      setTimeout(() => productNameInputRef.current?.focus(), 150);
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  // Quick lookup when barcode changes
  const handleBarcodeChange = (val: string) => {
    setBarcode(val);
    const clean = val.replace(/[\s-]/g, '');
    const matched = findPresetProductByBarcode(clean);
    if (matched) {
      setProductName(matched.productName);
      if (matched.category) setCategory(matched.category);
      setScanSuccessMessage(`유통 바코드 자동 매칭: "${matched.productName}"`);
    } else if (clean.length >= 8) {
      fetchBarcodePublicInfo(clean);
    }
  };

  // Start Live Camera Barcode Scanning
  const startCamera = async () => {
    setCameraError(null);
    hasDetectedRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        '현재 브라우저 환경에서 실시간 카메라를 지원하지 않습니다. "사진 파일 업로드" 기능을 이용해 주세요.'
      );
      return;
    }

    try {
      setIsCameraActive(true);
      setScanSuccessMessage('카메라 실행 중... 바코드를 노란색/보라색 사각틀 안에 비춰주세요.');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      startScanLoop();
    } catch (err: any) {
      console.warn('Camera access error caught:', err);
      const errStr = (err?.message || err?.name || '').toLowerCase();

      if (
        errStr.includes('not found') ||
        errStr.includes('notfounderror') ||
        errStr.includes('overconstrained') ||
        errStr.includes('devicesnotfound')
      ) {
        setCameraError(
          '카메라 장치(웹캠)를 찾을 수 없습니다. 외장 카메라를 연결하시거나 "사진 파일 업로드" 기능을 이용해 주세요.'
        );
      } else if (
        errStr.includes('permission') ||
        errStr.includes('notallowederror') ||
        errStr.includes('denied')
      ) {
        setCameraError(
          '카메라 접근 권한이 허용되지 않았습니다. 브라우저 주소창 좌측 자물쇠 아이콘에서 카메라 권한을 켜주시거나 "사진 파일 업로드"를 이용해 주세요.'
        );
      } else {
        setCameraError(
          '카메라를 실행할 수 없습니다. "사진 파일 업로드"를 통해 바코드 사진을 등록해 주세요.'
        );
      }
      setIsCameraActive(false);
    }
  };

  // Continuous barcode detection loop using native BarcodeDetector with ZXing fallback
  const startScanLoop = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    const hasNativeDetector = 'BarcodeDetector' in window;
    let nativeDetector: any = null;
    if (hasNativeDetector) {
      try {
        nativeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
        });
      } catch (e) {
        nativeDetector = null;
      }
    }

    const codeReader = new BrowserMultiFormatReader();

    const scanFrame = async () => {
      if (hasDetectedRef.current || !videoRef.current) return;
      if (videoRef.current.readyState < 2) return;

      // 1. Native BarcodeDetector (instant, GPU accelerated)
      if (nativeDetector) {
        try {
          const barcodes = await nativeDetector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            const raw = barcodes[0].rawValue.trim();
            if (raw && !hasDetectedRef.current) {
              hasDetectedRef.current = true;
              stopCamera();
              handleDetectedBarcode(raw, '실시간 카메라 바코드 스캔 완료!');
              return;
            }
          }
        } catch (e) {
          // Fall through to ZXing
        }
      }

      // 2. ZXing fallback
      try {
        const result = await codeReader.decodeOnceFromVideoElement(videoRef.current);
        if (result && result.getText() && !hasDetectedRef.current) {
          const raw = result.getText().trim();
          if (raw) {
            hasDetectedRef.current = true;
            stopCamera();
            handleDetectedBarcode(raw, '실시간 카메라 바코드 스캔 완료!');
            return;
          }
        }
      } catch (e) {
        // Barcode not in frame or blurry
      }
    };

    scanIntervalRef.current = setInterval(scanFrame, 200);
  };

  // Stop camera stream
  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Process a detected barcode string
  const handleDetectedBarcode = async (code: string, successMsg: string) => {
    const clean = code.replace(/[\s-]/g, '');
    setBarcode(clean);
    playSuccessChime();

    if (navigator.vibrate) {
      try {
        navigator.vibrate([40, 30, 40]);
      } catch (e) {}
    }

    // 1. Instant check in preset catalog for zero-latency response
    const localMatch = findPresetProductByBarcode(clean);
    if (localMatch) {
      setProductName(localMatch.productName);
      if (localMatch.category) setCategory(localMatch.category);
      setScanSuccessMessage(`${successMsg} - [공공 유통 카탈로그] "${localMatch.productName}" 자동 기입 완료!`);
      return;
    }

    // 2. Fetch from public API / server catalog
    setScanSuccessMessage(`${successMsg} (바코드: ${clean}) - 유통 공공데이터 상품명 조회 중...`);
    setIsLookingUpBarcode(true);
    try {
      const info = await lookupBarcodeFromPublicAPI(clean);
      if (info && info.productName && !info.productName.includes('한국 유통상품')) {
        setProductName(info.productName);
        if (info.category) setCategory(info.category);
        setScanSuccessMessage(
          `[${info.sourceName || '공공 유통데이터'}] "${info.productName}" 자동 기입 완료!`
        );
        playSuccessChime();
      } else {
        // Unlisted product: NEVER fill in "한국 유통상품"! Leave empty and prompt user
        setProductName('');
        setScanSuccessMessage(`바코드 [${clean}] 스캔 성공! 상품명을 입력해 주세요.`);
        setTimeout(() => productNameInputRef.current?.focus(), 150);
      }
    } catch (e) {
      console.warn('Barcode lookup failed:', e);
      setProductName('');
      setScanSuccessMessage(`바코드 [${clean}] 스캔 완료! 상품명을 입력해 주세요.`);
      setTimeout(() => productNameInputRef.current?.focus(), 150);
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  // Play subtle feedback chime
  const playSuccessChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch (e) {
      // AudioContext may be blocked before interaction
    }
  };

  // Handle image file upload (from device album, photo, or screenshot)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setScanSuccessMessage(null);
    setCameraError(null);

    try {
      const base64 = await fileToBase64(file);
      setScannedPhotoPreview(base64);

      // 1. Try local barcode decode first via HTMLImageElement
      const img = new Image();
      img.src = base64;
      await new Promise((res) => {
        img.onload = res;
      });

      const localBarcode = await decodeBarcodeFromImage(img);

      if (localBarcode) {
        setIsAnalyzing(false);
        await handleDetectedBarcode(localBarcode, '사진에서 바코드 감지 성공!');
        return;
      }

      // 2. If local decode didn't find clear 1D bars, use AI Vision
      setScanSuccessMessage('사진 속 상품 라벨 분석 중...');
      const aiResult = await scanBarcodeWithAI(base64, file.type || 'image/jpeg');

      if (aiResult) {
        if (aiResult.barcode) {
          setBarcode(aiResult.barcode);
          await fetchBarcodePublicInfo(aiResult.barcode);
        } else {
          if (aiResult.productName && !aiResult.productName.includes('한국 유통상품')) {
            setProductName(aiResult.productName);
          }
          if (aiResult.category) {
            setCategory(aiResult.category);
          }
          setScanSuccessMessage(`스캔 완료: [${aiResult.productName || '상품'}] 자동 입력`);
          playSuccessChime();
        }
      }
    } catch (err: any) {
      console.warn('AI scan error fallback:', err);
      setCameraError(
        '사진에서 바코드를 판독하지 못했습니다. 수동으로 상품명을 입력하거나 더 선명한 바코드 사진을 올려주세요.'
      );
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      alert('상품명을 입력해 주세요.');
      productNameInputRef.current?.focus();
      return;
    }
    if (quantity <= 0) {
      alert('수량은 1개 이상이어야 합니다.');
      return;
    }

    onSave({
      barcode: barcode.trim() || `MANUAL-${Date.now().toString().slice(-6)}`,
      productName: productName.trim(),
      category,
      quantity,
      unitPrice: 0,
      costPrice: 0,
      date: disposalDate,
      disposalTime: initialTimeSlot || '22:00',
      reason,
      notes: notes.trim(),
      photoUrl: scannedPhotoPreview || undefined,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <Scan className="w-5 h-5 text-purple-700" />
              편의점 폐기 상품 등록
              <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                공공데이터 유통바코드 API 연동
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              공공데이터포털 유통바코드 정보 Open API & 실시간 바코드 스캔으로 상품 자동 등록
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Scanner view */}
          <div className="space-y-4">
              {/* Camera / Upload Action Bar */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={isCameraActive ? stopCamera : startCamera}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                    isCameraActive
                      ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                      : 'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100 shadow-xs'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  {isCameraActive ? '카메라 끄기' : '실시간 카메라 스캔'}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  사진 파일 업로드
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Live Video Scanner Viewport */}
              <div
                className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-purple-500 shadow-inner flex items-center justify-center transition-all ${
                  isCameraActive ? 'block' : 'hidden'
                }`}
              >
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                {/* Target frame */}
                <div className="absolute inset-x-8 sm:inset-x-14 inset-y-8 sm:inset-y-10 border-2 border-dashed border-purple-400 rounded-lg pointer-events-none flex flex-col items-center justify-between p-2.5 bg-purple-500/5">
                  <span className="text-[11px] font-mono text-purple-200 bg-black/75 px-3 py-1 rounded-full shadow-xs">
                    바코드를 이 사각 영역 중앙에 맞춰주세요
                  </span>
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-pulse shadow-sm shadow-purple-400" />
                  <span className="text-[10px] text-purple-300 bg-black/75 px-2.5 py-0.5 rounded-full">
                    실시간 자동 감지 중...
                  </span>
                </div>
              </div>

              {/* Photo preview if uploaded */}
              {scannedPhotoPreview && !isCameraActive && (
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <img
                    src={scannedPhotoPreview}
                    alt="업로드된 바코드 사진"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">스캔된 사진</p>
                    <p className="text-xs text-slate-500 truncate">
                      바코드 및 유통기한 라벨 정보가 분석되었습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannedPhotoPreview(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    삭제
                  </button>
                </div>
              )}

              {/* Loading indicator */}
              {isAnalyzing && (
                <div className="flex items-center justify-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  <span>바코드 및 상품 정보 인식 중... 잠시만 기다려주세요</span>
                </div>
              )}

              {/* Success message */}
              {scanSuccessMessage && !isAnalyzing && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{scanSuccessMessage}</span>
                </div>
              )}

              {/* Camera error */}
              {cameraError && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{cameraError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg font-semibold shrink-0 transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    사진 파일 업로드
                  </button>
                </div>
              )}
            </div>

          {/* Registration Form Fields */}
          <form onSubmit={handleSubmit} id="waste-form" className="space-y-4 pt-2 border-t border-slate-200">
            {/* Barcode and Product Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    바코드 번호 (880...)
                  </label>
                  <span className="text-[11px] text-purple-700 font-medium">
                    공공데이터포털(data.go.kr)
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => handleBarcodeChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          fetchBarcodePublicInfo(barcode);
                        }
                      }}
                      placeholder="바코드 13자리 입력"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-slate-900 placeholder:text-slate-400"
                    />
                    {barcode && (
                      <button
                        type="button"
                        onClick={() => {
                          setBarcode('');
                          setProductName('');
                        }}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="지우기"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchBarcodePublicInfo(barcode)}
                    disabled={isLookingUpBarcode || !barcode.trim()}
                    className="px-3 py-2 text-xs font-semibold bg-purple-700 hover:bg-purple-800 disabled:bg-slate-100 text-white disabled:text-slate-400 rounded-lg transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                    title="공공데이터포털 유통바코드 정보 조회"
                  >
                    {isLookingUpBarcode ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>공공데이터 조회</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    상품명 <span className="text-rose-500">*</span>
                  </label>
                  {productName && (
                    <span className="text-[10px] text-purple-700 font-medium bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      자동 기입됨
                    </span>
                  )}
                </div>
                <input
                  ref={productNameInputRef}
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="바코드 스캔 시 자동 입력"
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Quantity and Date only (Category and Reason removed) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  폐기 수량 <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-2 text-center text-sm font-semibold tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500 ml-1">개</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  폐기 날짜 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="submit"
            form="waste-form"
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            폐기 등록 완료
          </button>
        </div>
      </div>
    </div>
  );
};
