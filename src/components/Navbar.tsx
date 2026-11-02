import React from 'react';
import {
  Calendar,
  CalendarDays,
  Scan,
  Store,
  RotateCcw,
} from 'lucide-react';
import { StoreSettings } from '../utils/storage';

interface NavbarProps {
  viewMode: 'month' | 'week';
  onChangeViewMode: (mode: 'month' | 'week') => void;
  onOpenScanner: () => void;
  onResetSampleData: () => void;
  storeSettings: StoreSettings;
  onChangeStoreName: (name: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  onChangeViewMode,
  onOpenScanner,
  onResetSampleData,
  storeSettings,
  onChangeStoreName,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 sm:gap-8 h-16">
          {/* Zone 1: Single text element wordmark / brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-purple-700 flex items-center justify-center text-white shadow-xs font-bold text-sm">
              CU
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                CU봉암공단점
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-500">
                폐기 관리 시스템
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation links / View toggles (single-line, clean) */}
          <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
            <button
              type="button"
              onClick={() => onChangeViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-purple-50 text-purple-800 border border-purple-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              월별 캘린더
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-purple-50 text-purple-800 border border-purple-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              주별 캘린더
            </button>

            <button
              type="button"
              onClick={onResetSampleData}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="샘플 데이터 재설정"
            >
              <RotateCcw className="w-3 h-3" />
              데이터 복원
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenScanner}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Scan className="w-4 h-4" />
              <span>바코드 폐기 등록</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
