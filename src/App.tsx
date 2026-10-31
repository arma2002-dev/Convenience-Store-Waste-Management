import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Scan, Download, Search } from 'lucide-react';
import { WasteItem } from './types/waste';
import {
  loadWasteItems,
  saveWasteItems,
  loadStoreSettings,
  saveStoreSettings,
  exportWasteToCSV,
  formatKRW,
  StoreSettings,
} from './utils/storage';
import { generateSeedData } from './data/seedData';
import { Navbar } from './components/Navbar';
import { MonthlyCalendar } from './components/MonthlyCalendar';
import { WeeklyCalendar } from './components/WeeklyCalendar';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DayDetailModal } from './components/DayDetailModal';

export default function App() {
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Dark Mode State with localStorage persistence & system check
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem('cu_waste_theme');
      if (savedTheme === 'dark') return true;
      if (savedTheme === 'light') return false;
      // Default to dark mode during typical convenience store night shifts (20:00 ~ 07:00) or system preference
      const hour = new Date().getHours();
      const isNightHours = hour >= 20 || hour < 7;
      return isNightHours || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  });

  // Apply dark mode class to html document element
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('cu_waste_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('cu_waste_theme', 'light');
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

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

  // Load items on mount
  useEffect(() => {
    const loaded = loadWasteItems();
    setWasteItems(loaded);
  }, []);

  // Save items on change
  const handleUpdateItems = (newItems: WasteItem[]) => {
    setWasteItems(newItems);
    saveWasteItems(newItems);
  };

  // Add new waste item
  const handleSaveWasteItem = (itemData: Omit<WasteItem, 'id' | 'registeredAt'>) => {
    const newItem: WasteItem = {
      ...itemData,
      id: `waste-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      registeredAt: new Date().toISOString(),
    };

    const updated = [newItem, ...wasteItems];
    handleUpdateItems(updated);

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
  const handleDeleteItem = (id: string) => {
    const updated = wasteItems.filter((i) => i.id !== id);
    handleUpdateItems(updated);
  };

  // Update item quantity
  const handleUpdateQuantity = (id: string, newQty: number) => {
    const updated = wasteItems.map((i) => (i.id === id ? { ...i, quantity: newQty } : i));
    handleUpdateItems(updated);
  };

  // Month navigation
  const handleNavigateMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  // Week navigation
  const handleNavigateWeek = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + delta * 7);
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

  // Open scanner with date and time
  const handleAddOnDateAndTime = (dateStr: string, timeSlot: string) => {
    setScannerInitialDate(dateStr);
    setScannerInitialTimeSlot(timeSlot);
    setIsScannerOpen(true);
  };

  // Reset sample data
  const handleResetSampleData = () => {
    if (confirm('샘플 폐기 데이터를 복원하시겠습니까? (기존 데이터는 덮어씌워집니다)')) {
      const sample = generateSeedData();
      handleUpdateItems(sample);
    }
  };

  // Save store name
  const handleSaveStoreName = () => {
    const newSettings = { ...storeSettings, storeName: storeNameInput.trim() || '우리편의점' };
    setStoreSettings(newSettings);
    saveStoreSettings(newSettings);
    setIsEditingStore(false);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Top Bar Navigation */}
      <Navbar
        viewMode={viewMode}
        onChangeViewMode={(mode) => setViewMode(mode)}
        onOpenScanner={() => {
          setScannerInitialDate(new Date().toISOString().split('T')[0]);
          setScannerInitialTimeSlot(undefined);
          setIsScannerOpen(true);
        }}
        onResetSampleData={handleResetSampleData}
        storeSettings={storeSettings}
        onChangeStoreName={(name) => {
          setStoreSettings({ ...storeSettings, storeName: name });
          saveStoreSettings({ ...storeSettings, storeName: name });
        }}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Branch Context Banner & Quick Utilities */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-sm shrink-0 border border-purple-200 dark:border-purple-800/60">
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
                      className="px-2 py-0.5 text-sm font-bold border border-purple-500 rounded focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleSaveStoreName}
                      className="px-2 py-0.5 text-xs bg-purple-700 hover:bg-purple-800 text-white rounded font-medium transition-colors"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">{storeSettings.storeName}</h1>
                    <button
                      type="button"
                      onClick={() => {
                        setStoreNameInput(storeSettings.storeName);
                        setIsEditingStore(true);
                      }}
                      className="text-[11px] text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 underline"
                    >
                      점포명 변경
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>CU봉암공단점 폐기 등록 및 현황 관리</span>
                <span aria-hidden="true">·</span>
                <span>바코드 사진 스캔 자동 입력</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setScannerInitialDate(new Date().toISOString().split('T')[0]);
                setScannerInitialTimeSlot(undefined);
                setIsScannerOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/60 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
            >
              <Scan className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
              사진 바코드 스캔
            </button>

            <button
              type="button"
              onClick={() => exportWasteToCSV(wasteItems, `CU봉암공단점_폐기대장.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              title="CSV 엑셀 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              엑셀 다운로드
            </button>
          </div>
        </div>

        {/* Search Bar (품목명 또는 바코드 검색) */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="품목명 또는 바코드 검색..."
              className="w-full pl-10 pr-20 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded font-medium transition-colors cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 text-xs text-purple-700 dark:text-purple-400 font-medium px-1 flex items-center justify-between">
              <span>'{searchQuery}' 검색 결과: 총 {filteredItems.length}건</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer"
              >
                검색 취소
              </button>
            </div>
          )}
        </div>

        {/* Calendar View Container */}
        {viewMode === 'month' ? (
          <MonthlyCalendar
            currentDate={currentDate}
            onNavigateMonth={handleNavigateMonth}
            onSelectToday={handleSelectToday}
            wasteItems={filteredItems}
            onSelectDate={handleSelectDate}
            onAddOnDate={handleAddOnDate}
          />
        ) : (
          <WeeklyCalendar
            currentDate={currentDate}
            onNavigateWeek={handleNavigateWeek}
            onSelectToday={handleSelectToday}
            wasteItems={filteredItems}
            onSelectDate={handleSelectDate}
            onAddOnDateAndTime={handleAddOnDateAndTime}
            onDeleteItem={handleDeleteItem}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CU봉암공단점 · 편의점 폐기 관리 시스템 (야간 안심 모드 지원)</span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
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
