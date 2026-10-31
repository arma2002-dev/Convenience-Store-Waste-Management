import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Scan,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  Layers,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { WasteItem, WasteCategory, DisposalTimeSlot, DisposalReason } from '../types/waste';
import { PRESET_PRODUCTS, CATEGORY_COLORS } from '../data/presetProducts';
import {
  decodeBarcodeFromImage,
  fileToBase64,
  findPresetProductByBarcode,
  scanBarcodeWithAI,
} from '../utils/barcodeScanner';
import { formatKRW } from '../utils/storage';

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
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');

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
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  // Sync date when modal opens with initialDate
  useEffect(() => {
    if (isOpen) {
      if (initialDate) setDisposalDate(initialDate);
      setScanSuccessMessage(null);
      setCameraError(null);
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

  // Quick lookup when barcode changes
  const handleBarcodeChange = (val: string) => {
    setBarcode(val);
    const matched = findPresetProductByBarcode(val);
    if (matched) {
      setProductName(matched.productName);
      setCategory(matched.category);
      setScanSuccessMessage(`기등록 상품 자동 매칭: ${matched.productName}`);
    }
  };

  // Start Live Camera Barcode Scanning
  const startCamera = async () => {
    setCameraError(null);

    // 1. Check if mediaDevices API is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        '현재 브라우저 환경에서는 실시간 카메라 접근이 지원되지 않습니다. "사진 파일 업로드" 기능을 이용해 주세요.'
      );
      setIsCameraActive(false);
      return;
    }

    try {
      // 2. Query available video input devices
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices().catch(
        () => []
      );

      if (!videoInputDevices || videoInputDevices.length === 0) {
        setCameraError(
          '연결된 카메라(웹캠) 장치를 찾을 수 없습니다. 카메라가 있는 스마트폰/노트북을 사용하시거나 "사진 파일 업로드"로 바코드 사진을 올려주세요.'
        );
        setIsCameraActive(false);
        return;
      }

      setIsCameraActive(true);

      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Prefer back/rear camera if available on mobile
      const backCam = videoInputDevices.find((d) =>
        /back|rear|environment|후면|배면/i.test(d.label)
      );
      const selectedDeviceId = backCam?.deviceId || videoInputDevices[0]?.deviceId;

      const controls = await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const detectedCode = result.getText();
            handleDetectedBarcode(detectedCode, '실시간 카메라 바코드 스캔 완료!');
            stopCamera();
          }
        }
      );
      controlsRef.current = controls;
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

  // Stop camera stream
  const stopCamera = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        console.debug(e);
      }
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Process a detected barcode string
  const handleDetectedBarcode = (code: string, successMsg: string) => {
    setBarcode(code);
    const matched = findPresetProductByBarcode(code);
    if (matched) {
      setProductName(matched.productName);
      setCategory(matched.category);
      setScanSuccessMessage(`${successMsg} (${matched.productName})`);
    } else {
      setScanSuccessMessage(`${successMsg} (바코드 번호: ${code})`);
      if (!productName) {
        setProductName('신규 등록 상품 (' + code.slice(-4) + ')');
      }
    }
    playSuccessChime();
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
        handleDetectedBarcode(localBarcode, '사진에서 바코드 감지 성공!');
        setIsAnalyzing(false);
        return;
      }

      // 2. If local decode didn't find clear 1D bars, use Gemini 3.8 Flash AI Vision!
      setScanSuccessMessage('AI가 사진 속 상품 및 라벨을 분석 중입니다...');
      const aiResult = await scanBarcodeWithAI(base64, file.type || 'image/jpeg');

      if (aiResult) {
        if (aiResult.barcode) {
          setBarcode(aiResult.barcode);
        }
        if (aiResult.productName) {
          setProductName(aiResult.productName);
        }
        if (aiResult.category) {
          setCategory(aiResult.category);
        }
        setScanSuccessMessage(`AI 스캔 완료: [${aiResult.productName}] 자동 입력`);
        playSuccessChime();
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

  // Select a preset item quickly
  const handleSelectPreset = (p: typeof PRESET_PRODUCTS[0]) => {
    setBarcode(p.barcode);
    setProductName(p.productName);
    setCategory(p.category);
    setScanSuccessMessage(`선택 완료: ${p.productName}`);
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      alert('상품명을 입력해 주세요.');
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
      disposalTime: '',
      reason,
      notes: notes.trim() || undefined,
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
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Scan className="w-5 h-5 text-teal-600" />
              편의점 폐기 상품 등록
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              바코드 사진 스캔 및 자동인식으로 빠르게 등록하세요
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex border-b border-slate-200 bg-white px-6 pt-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('scan');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'scan'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            사진 / 바코드 스캔
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('manual');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'manual'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Search className="w-4 h-4" />
            직접 입력 및 품목 검색
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Scanner view */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              {/* Camera / Upload Action Bar */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={isCameraActive ? stopCamera : startCamera}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
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
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-xs"
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
              {isCameraActive && (
                <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-teal-500 shadow-inner flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline />
                  {/* Target frame */}
                  <div className="absolute inset-x-12 inset-y-10 border-2 border-dashed border-teal-400 rounded-lg pointer-events-none flex flex-col items-center justify-between p-2">
                    <span className="text-[11px] font-mono text-teal-200 bg-black/60 px-2 py-0.5 rounded">
                      바코드를 이 사각 영역 안에 맞춰주세요
                    </span>
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent animate-pulse" />
                    <span className="text-[10px] text-teal-300 bg-black/60 px-2 py-0.5 rounded">
                      자동 인식 대기 중
                    </span>
                  </div>
                </div>
              )}

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
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg font-semibold shrink-0 transition-colors whitespace-nowrap shadow-2xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    사진 파일 업로드
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Quick Presets */}
          {activeTab === 'manual' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                자주 폐기되는 편의점 베스트 상품 원클릭 선택
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                {PRESET_PRODUCTS.slice(0, 12).map((p) => (
                  <button
                    key={p.barcode}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className="flex flex-col text-left p-2 rounded-lg border border-slate-200 bg-white hover:border-purple-500 hover:bg-purple-50/50 transition-all text-xs"
                  >
                    <span className="font-semibold text-slate-800 truncate">{p.productName}</span>
                    <span className="text-slate-500 text-[11px]">
                      {p.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Registration Form Fields */}
          <form onSubmit={handleSubmit} id="waste-form" className="space-y-4 pt-2 border-t border-slate-200">
            {/* Barcode and Product Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  바코드 번호 (880...)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => handleBarcodeChange(e.target.value)}
                    placeholder="바코드 13자리 입력"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => handleBarcodeChange('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  상품명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 참치마요 삼각김밥"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Category and Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as WasteCategory)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="삼각김밥/주먹밥">삼각김밥 / 주먹밥</option>
                  <option value="도시락/덮밥">도시락 / 덮밥</option>
                  <option value="샌드위치/햄버거">샌드위치 / 햄버거</option>
                  <option value="김밥/롤">김밥 / 롤</option>
                  <option value="유제품/음료">유제품 / 음료</option>
                  <option value="디저트/베이커리">디저트 / 베이커리</option>
                  <option value="조리/튀김">조리 / 튀김</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  폐기 수량 <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-2 text-center text-sm font-semibold tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500 ml-1">개</span>
                </div>
              </div>
            </div>

            {/* Date and Reason only */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">폐기 날짜 <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  required
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">폐기 사유</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DisposalReason)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="유통기한 경과">유통기한 경과</option>
                  <option value="포장 훼손">포장 훼손</option>
                  <option value="신선도 저하">신선도 저하</option>
                  <option value="기타 사유">기타 사유</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            form="waste-form"
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg shadow-sm transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            폐기 등록 완료
          </button>
        </div>
      </div>
    </div>
  );
};
