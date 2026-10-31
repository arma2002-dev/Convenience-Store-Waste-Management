import React from 'react';
import {
  Calendar,
  CalendarDays,
  Scan,
  Store,
  RotateCcw,
  Sun,
  Moon,
} from 'lucide-react';
import { StoreSettings } from '../utils/storage';

interface NavbarProps {
  viewMode: 'month' | 'week';
  onChangeViewMode: (mode: 'month' | 'week') => void;
  onOpenScanner: () => void;
  onResetSampleData: () => void;
  storeSettings: StoreSettings;
  onChangeStoreName: (name: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  onChangeViewMode,
  onOpenScanner,
  onResetSampleData,
  storeSettings,
  onChangeStoreName,
  isDarkMode,
  onToggleDarkMode,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 sm:gap-8 h-16">
          {/* Zone 1: Single text element wordmark / brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-purple-700 flex items-center justify-center text-white shadow-xs font-bold text-sm">
              CU
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                CU봉암공단점
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                폐기 관리 시스템
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation links / View toggles (single-line, clean) */}
          <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
            <button
              type="button"
              onClick={() => onChangeViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'month'
                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              월별 캘린더
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'week'
                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              주별 캘린더
            </button>

            <button
              type="button"
              onClick={onResetSampleData}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors whitespace-nowrap shrink-0"
              title="샘플 데이터 재설정"
            >
              <RotateCcw className="w-3 h-3" />
              데이터 복원
            </button>
          </nav>

          {/* Zone 3: Theme Toggle & Primary Action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Dark / Night Mode Toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-750 text-amber-300 border-slate-700 shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 shadow-2xs'
              }`}
              title={
                isDarkMode
                  ? '주간 모드로 전환'
                  : '야간 모드로 전환 (편의점 야간 근무 시 눈부심 방지)'
              }
              aria-label={isDarkMode ? '주간 모드로 전환' : '야간 모드로 전환'}
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="hidden sm:inline font-semibold">주간 모드</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="hidden sm:inline font-semibold">야간 모드</span>
                </>
              )}
            </button>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={onOpenScanner}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0"
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
