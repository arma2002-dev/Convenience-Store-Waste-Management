import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Package,
  Barcode,
} from 'lucide-react';
import { WasteItem } from '../types/waste';
import { CATEGORY_COLORS } from '../data/presetProducts';

interface WeeklyCalendarProps {
  currentDate: Date;
  onNavigateWeek: (delta: number) => void;
  onSelectToday: () => void;
  wasteItems: WasteItem[];
  onSelectDate: (dateStr: string) => void;
  onAddOnDateAndTime: (dateStr: string, timeSlot: string) => void;
  onDeleteItem: (id: string) => void;
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  currentDate,
  onNavigateWeek,
  onSelectToday,
  wasteItems,
  onSelectDate,
  onAddOnDateAndTime,
  onDeleteItem,
}) => {
  // Let's use Sunday as starting day of the week
  const startOfWeek = new Date(currentDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  // Generate 7 days for this week
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    weekDays.push({
      date: d,
      dateStr,
      dayName: ['일', '월', '화', '수', '목', '금', '토'][i],
      dayNum: d.getDate(),
      monthNum: d.getMonth() + 1,
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const startStr = weekDays[0].dateStr;
  const endStr = weekDays[6].dateStr;

  // Filter items in this week
  const weekItems = wasteItems.filter(
    (item) => item.date >= startStr && item.date <= endStr
  );

  const totalWeekQty = weekItems.reduce((acc, c) => acc + c.quantity, 0);

  // Identify highest waste day of the week by quantity
  const dayTotals: Record<string, number> = {};
  weekItems.forEach((item) => {
    dayTotals[item.date] = (dayTotals[item.date] || 0) + item.quantity;
  });
  const worstDayEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  const worstDayStr =
    worstDayEntry && worstDayEntry[1] > 0
      ? weekDays.find((w) => w.dateStr === worstDayEntry[0])?.dayName + '요일'
      : '없음';

  return (
    <div className="space-y-4">
      {/* Week Navigation & Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        {/* Nav controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigateWeek(-1)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="이전 주"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateWeek(1)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="다음 주"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {weekDays[0].monthNum}월 {weekDays[0].dayNum}일 ~ {weekDays[6].monthNum}월{' '}
              {weekDays[6].dayNum}일
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">주간 폐기 타임테이블</div>
          </div>

          <button
            onClick={onSelectToday}
            className="px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
          >
            이번 주
          </button>
        </div>

        {/* Weekly metrics */}
        <div className="grid grid-cols-3 gap-3 lg:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">주간 폐기 품목</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {weekItems.length}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">건</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">주간 총 폐기 수량</div>
            <div className="text-base font-bold text-purple-700 dark:text-purple-400 tabular-nums">
              {totalWeekQty}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">개</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">최다 폐기 요일</div>
            <div className="text-base font-bold text-slate-800 dark:text-slate-200 tabular-nums">
              {worstDayStr}
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Columns Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
        {weekDays.map((w, idx) => {
          const dayItems = wasteItems.filter((i) => i.date === w.dateStr);
          const dayQty = dayItems.reduce((acc, c) => acc + c.quantity, 0);
          const isToday = w.dateStr === todayStr;

          return (
            <div
              key={w.dateStr}
              className={`flex flex-col bg-white dark:bg-slate-900 rounded-2xl border transition-all ${
                isToday
                  ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-800 shadow-xs'
              }`}
            >
              {/* Day Header */}
              <div
                onClick={() => onSelectDate(w.dateStr)}
                className={`p-3 border-b cursor-pointer transition-colors ${
                  isToday
                    ? 'bg-teal-50/50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/80 hover:bg-teal-50 dark:hover:bg-teal-900/40'
                    : 'bg-slate-50/60 dark:bg-slate-950/60 border-slate-100 dark:border-slate-800 hover:bg-slate-100/60 dark:hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      idx === 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : idx === 6
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {w.dayName}요일
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-1.5 py-0.2 rounded">
                      오늘
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {w.monthNum}.{w.dayNum}
                  </span>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                    {dayQty > 0 ? `${dayQty}개 폐기` : '-'}
                  </span>
                </div>
              </div>

              {/* Day Content: Items list */}
              <div className="flex-1 p-2 space-y-2 min-h-[360px] overflow-y-auto max-h-[500px]">
                {dayItems.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-3 text-slate-400 dark:text-slate-600 text-xs">
                    <Package className="w-6 h-6 mb-1 text-slate-300 dark:text-slate-700 stroke-1" />
                    <span>폐기 등록 없음</span>
                  </div>
                ) : (
                  dayItems.map((item) => {
                    const catColor =
                      CATEGORY_COLORS[item.category] || CATEGORY_COLORS['기타'];

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border text-xs relative group/item bg-white dark:bg-slate-800/90 hover:shadow-xs transition-all ${catColor.border} dark:border-slate-700`}
                      >
                        {/* Top row: Product Name & Delete */}
                        <div className="flex items-start justify-between gap-1">
                          <div
                            className="font-semibold text-slate-800 dark:text-slate-100 leading-tight text-xs flex-1"
                            title={item.productName}
                          >
                            {item.productName}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`'${item.productName}' 폐기 내역을 삭제하시겠습니까?`)) {
                                onDeleteItem(item.id);
                              }
                            }}
                            className="opacity-0 group-hover/item:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-opacity shrink-0 cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Barcode Number: dedicated row, completely visible without any truncate */}
                        <div
                          className="mt-1.5 flex items-center gap-1 font-mono text-[10.5px] sm:text-[11px] bg-slate-50 dark:bg-slate-900 px-1.5 py-1 rounded border border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-300 w-full"
                          title={`바코드: ${item.barcode || '바코드 없음'}`}
                        >
                          <Barcode className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="font-semibold tracking-tighter sm:tracking-normal tabular-nums break-all select-all leading-tight">
                            {item.barcode || '바코드 없음'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
                          <span className="font-bold text-purple-700 dark:text-purple-400 font-mono">
                            수량: {item.quantity}개
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                            {item.reason}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Quick Add on this date */}
              <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => onAddOnDateAndTime(w.dateStr, '')}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/80 dark:border-purple-800/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  폐기 등록
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
