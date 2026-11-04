import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Scan, Download, Search, RotateCcw, RefreshCw, CheckCircle2, Smartphone, Laptop } from 'lucide-react';
import { WasteItem } from './types/waste';
import {
  loadWasteItems,
  saveWasteItems,
  loadStoreSettings,
  saveStoreSettings,
  exportWasteToCSV,
  StoreSettings,
  fetchWasteItemsFromServer,
  addWasteItemServer,
  updateWasteItemServer,
  deleteWasteItemServer,
  syncLocalWasteItemsToServer,
  resetWasteItemsServer,
  saveStoreSettingsServer,
} from './utils/storage';
import { generateSeedData } from './data/seedData';
import { MonthlyCalendar } from './components/MonthlyCalendar';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DayDetailModal } from './components/DayDetailModal';

export default function App() {
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Search (Product Name or Barcode)
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [selectedDateForDetail, setSelectedDateForDetail] = useState<string | null>(null);

  // Scanner initial props when opening from calendar cell
  const [scannerInitialDate, setScannerInitialDate] = useState<string | undefined>();
  const [scannerInitialTimeSlot, setScannerInitialTimeSlot] = useState<string | undefined>();

  // Store settings
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(loadStoreSettings());
  const [isEditingStore, setIsEditingStore] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState(storeSettings.storeName);

  // Cross-device sync status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('실시간 연결됨');
  const serverVersionRef = useRef<number>(0);

  // Clean up any lingering dark mode class on mount
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try {
      localStorage.removeItem('cu_waste_theme');
    } catch (e) {}
  }, []);

  // Fetch / Sync with server
  const triggerSync = useCallback(async (isInitial = false) => {
    try {
      setIsSyncing(true);
      if (isInitial) {
        // Initial load: Merge any local items that may have been created on this device
        const cached = loadWasteItems();
        const result = await syncLocalWasteItemsToServer(cached);
        if (result && Array.isArray(result.items)) {
          setWasteItems(result.items);
          serverVersionRef.current = result.version;
          if (result.storeSettings) {
            setStoreSettings(result.storeSettings);
            setStoreNameInput(result.storeSettings.storeName);
          }
        } else {
          setWasteItems(cached);
        }
      } else {
        // Periodic check
        const result = await fetchWasteItemsFromServer();
        if (result && Array.isArray(result.items)) {
          // If server version increased or items changed, update
          if (result.version !== serverVersionRef.current || result.items.length !== wasteItems.length) {
            setWasteItems(result.items);
            serverVersionRef.current = result.version;
            if (result.storeSettings) {
              setStoreSettings(result.storeSettings);
            }
          }
        }
      }
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastSyncText(`${timeStr} 동기화`);
    } catch (err) {
      console.warn('Sync tick error:', err);
      setLastSyncText('오프라인 저장 중');
    } finally {
      setIsSyncing(false);
    }
  }, [wasteItems.length]);

  // Initial mount sync + load
  useEffect(() => {
    // 1. Instant local render
    const cached = loadWasteItems();
    setWasteItems(cached);

    // 2. Initial cloud server merge
    triggerSync(true);

    // 3. Periodic real-time poll every 4 seconds to sync mobile and PC seamlessly
    const interval = setInterval(() => {
      triggerSync(false);
    }, 4000);

    // 4. Also immediately sync when window gains focus (e.g. user toggles phone/PC tab)
    const handleFocus = () => {
      triggerSync(false);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [triggerSync]);

  // Add new waste item
  const handleSaveWasteItem = async (itemData: Omit<WasteItem, 'id' | 'registeredAt'>) => {
    const newItem: WasteItem = {
      ...itemData,
      id: `waste-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      registeredAt: new Date().toISOString(),
    };

    // Optimistic local update
    const updated = [newItem, ...wasteItems];
    setWasteItems(updated);
    saveWasteItems(updated);

    // Server push for cross-device sync
    try {
      setIsSyncing(true);
      await addWasteItemServer(newItem);
      const now = new Date();
      setLastSyncText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 동기화 완료`);
    } catch (err) {
      console.error('Failed to sync new item to server:', err);
    } finally {
      setIsSyncing(false);
    }

    // Subtle celebration feedback
    try {
      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.8 },
      });
    } catch (e) {
      // safe fallback
    }
  };

  // Delete item
  const handleDeleteItem = async (id: string) => {
    const updated = wasteItems.filter((i) => i.id !== id);
    setWasteItems(updated);
    saveWasteItems(updated);

    try {
      setIsSyncing(true);
      await deleteWasteItemServer(id);
    } catch (err) {
      console.error('Failed to delete on server:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Update item quantity
  const handleUpdateQuantity = async (id: string, newQty: number) => {
    const updated = wasteItems.map((i) => (i.id === id ? { ...i, quantity: newQty } : i));
    setWasteItems(updated);
    saveWasteItems(updated);

    try {
      await updateWasteItemServer(id, { quantity: newQty });
    } catch (err) {
      console.error('Failed to update quantity on server:', err);
    }
  };

  // Month navigation
  const handleNavigateMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  // Select today
  const handleSelectToday = () => {
    setCurrentDate(new Date());
  };

  // Open day detail
  const handleSelectDate = (dateStr: string) => {
    setSelectedDateForDetail(dateStr);
    setIsDayDetailOpen(true);
  };

  // Open scanner with pre-filled date
  const handleAddOnDate = (dateStr: string) => {
    setScannerInitialDate(dateStr);
    setScannerInitialTimeSlot(undefined);
    setIsScannerOpen(true);
  };

  // Reset sample data
  const handleResetSampleData = async () => {
    if (confirm('샘플 폐기 데이터를 복원하시겠습니까? (PC와 모바일 모두 초기화됩니다)')) {
      try {
        setIsSyncing(true);
        const resetItems = await resetWasteItemsServer();
        if (resetItems) {
          setWasteItems(resetItems);
        } else {
          const sample = generateSeedData();
          setWasteItems(sample);
          saveWasteItems(sample);
        }
      } finally {
        setIsSyncing(false);
      }
    }
  };

  // Save store name
  const handleSaveStoreName = async () => {
    const newSettings = { ...storeSettings, storeName: storeNameInput.trim() || '우리편의점' };
    setStoreSettings(newSettings);
    saveStoreSettings(newSettings);
    setIsEditingStore(false);
    await saveStoreSettingsServer(newSettings);
  };

  // Filter items based purely on product name or barcode search
  const filteredItems = wasteItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    return (
      item.productName.toLowerCase().includes(query) ||
      item.barcode.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Branch Context Banner & Quick Utilities */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 font-bold text-sm shrink-0 border border-purple-200">
              CU
            </div>

            <div>
              <div className="flex items-center gap-2">
                {isEditingStore ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={storeNameInput}
                      onChange={(e) => setStoreNameInput(e.target.value)}
                      className="px-2 py-0.5 text-sm font-bold border border-purple-500 rounded focus:outline-none bg-white text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={handleSaveStoreName}
                      className="px-2 py-0.5 text-xs bg-purple-700 hover:bg-purple-800 text-white rounded font-medium transition-colors cursor-pointer"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-base font-bold text-slate-900">{storeSettings.storeName}</h1>
                    <button
                      type="button"
                      onClick={() => {
                        setStoreNameInput(storeSettings.storeName);
                        setIsEditingStore(true);
                      }}
                      className="text-[11px] text-purple-700 hover:text-purple-900 underline cursor-pointer"
                    >
                      점포명 변경
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                <span>CU봉암공단점 폐기 등록 및 현황 관리</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                  {lastSyncText}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Real-time Cross-Device Sync Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-50/90 text-emerald-800 border border-emerald-200/90 rounded-lg shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-[11px] flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-emerald-500 font-bold">↔</span>
                <Laptop className="w-3.5 h-3.5 text-emerald-700" />
                <span>모바일/PC 실시간 동기화</span>
              </span>
              <button
                type="button"
                onClick={() => triggerSync(false)}
                disabled={isSyncing}
                title="지금 즉시 서버와 데이터 동기화"
                className="ml-1 p-1 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-800' : ''}`} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setScannerInitialDate(new Date().toISOString().split('T')[0]);
                setScannerInitialTimeSlot(undefined);
                setIsScannerOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 border border-purple-200/80 rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
            >
              <Scan className="w-3.5 h-3.5 text-purple-700" />
              사진 바코드 스캔
            </button>

            <button
              type="button"
              onClick={() => exportWasteToCSV(wasteItems, `CU봉암공단점_폐기대장.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              title="CSV 엑셀 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              엑셀 다운로드
            </button>

            <button
              type="button"
              onClick={handleResetSampleData}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              title="샘플 데이터 복원"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              데이터 복원
            </button>
          </div>
        </div>

        {/* Search Bar (품목명 또는 바코드 검색) */}
        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="품목명 또는 바코드 검색..."
              className="w-full pl-10 pr-20 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 bg-slate-50 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 px-2 py-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded font-medium transition-colors cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 text-xs text-purple-700 font-medium px-1 flex items-center justify-between">
              <span>'{searchQuery}' 검색 결과: 총 {filteredItems.length}건</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 underline cursor-pointer"
              >
                검색 취소
              </button>
            </div>
          )}
        </div>

        {/* Calendar View Container (월별 캘린더 단독 표시) */}
        <MonthlyCalendar
          currentDate={currentDate}
          onNavigateMonth={handleNavigateMonth}
          onSelectToday={handleSelectToday}
          wasteItems={filteredItems}
          onSelectDate={handleSelectDate}
          onAddOnDate={handleAddOnDate}
        />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CU봉암공단점 · 편의점 폐기 관리 시스템</span>
          <span className="font-mono text-slate-500">
            총 {wasteItems.length}건 · {wasteItems.reduce((acc, c) => acc + c.quantity, 0)}개 폐기 등록됨
          </span>
        </div>
      </footer>

      {/* Barcode Scanner & Waste Registration Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSave={handleSaveWasteItem}
        initialDate={scannerInitialDate}
        initialTimeSlot={scannerInitialTimeSlot}
      />

      {/* Day Detail Modal */}
      <DayDetailModal
        isOpen={isDayDetailOpen}
        dateStr={selectedDateForDetail}
        items={wasteItems.filter((i) => i.date === selectedDateForDetail)}
        onClose={() => setIsDayDetailOpen(false)}
        onAddOnDate={(date) => {
          setIsDayDetailOpen(false);
          handleAddOnDate(date);
        }}
        onDeleteItem={handleDeleteItem}
        onUpdateQuantity={handleUpdateQuantity}
      />
    </div>
  );
}
