import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  TrendingDown,
  Package,
  Calendar as CalendarIcon,
  ShoppingBag,
} from 'lucide-react';
import { WasteItem, WasteCategory } from '../types/waste';
import { CATEGORY_COLORS } from '../data/presetProducts';
import { formatKRW } from '../utils/storage';

interface MonthlyCalendarProps {
  currentDate: Date;
  onNavigateMonth: (delta: number) => void;
  onSelectToday: () => void;
  wasteItems: WasteItem[];
  onSelectDate: (dateStr: string) => void;
  onAddOnDate: (dateStr: string) => void;
}

export const MonthlyCalendar: React.FC<MonthlyCalendarProps> = ({
  currentDate,
  onNavigateMonth,
  onSelectToday,
  wasteItems,
  onSelectDate,
  onAddOnDate,
}) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Today string for comparison
  const todayStr = new Date().toISOString().split('T')[0];

  // First day of month and number of days
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthLastDate = new Date(year, month, 0).getDate();

  // Filter waste items for this month
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthItems = wasteItems.filter((item) => item.date.startsWith(monthPrefix));

  // Compute month summary stats
  const totalQuantity = monthItems.reduce((acc, cur) => acc + cur.quantity, 0);
  const totalRetailLoss = monthItems.reduce(
    (acc, cur) => acc + cur.unitPrice * cur.quantity,
    0
  );
  const totalCostLoss = monthItems.reduce(
    (acc, cur) => acc + cur.costPrice * cur.quantity,
    0
  );

  // Group items by category to find top wasted category
  const categoryCount: Record<string, number> = {};
  monthItems.forEach((item) => {
    categoryCount[item.category] = (categoryCount[item.category] || 0) + item.quantity;
  });
  const topCategory =
    Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '없음';

  // Build grid days
  const calendarCells = [];

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const prevDayNum = prevMonthLastDate - i;
    const prevMonthNum = month === 0 ? 12 : month;
    const prevYearNum = month === 0 ? year - 1 : year;
    const dateStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}-${String(
      prevDayNum
    ).padStart(2, '0')}`;
    calendarCells.push({
      dateStr,
      dayNum: prevDayNum,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true,
    });
  }

  // Next month leading days to complete 35 or 42 grid
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextMonthNum = month === 11 ? 1 : month + 2;
    const nextYearNum = month === 11 ? year + 1 : year;
    const dateStr = `${nextYearNum}-${String(nextMonthNum).padStart(2, '0')}-${String(d).padStart(
      2,
      '0'
    )}`;
    calendarCells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Items indexed by date for fast O(1) lookup
  const itemsByDate: Record<string, WasteItem[]> = {};
  wasteItems.forEach((item) => {
    if (!itemsByDate[item.date]) itemsByDate[item.date] = [];
    itemsByDate[item.date].push(item);
  });

  const weekDayNames = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="space-y-4">
      {/* Month Navigation & Metrics Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Nav controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigateMonth(-1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
              title="이전 달"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateMonth(1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
              title="다음 달"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
            {year}년 {month + 1}월
          </h2>

          <button
            onClick={onSelectToday}
            className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap"
          >
            오늘
          </button>
        </div>

        {/* Monthly Summary Statistics strip */}
        <div className="grid grid-cols-3 gap-3 lg:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
          <div>
            <div className="text-[11px] font-medium text-slate-500">당월 총 폐기 품목</div>
            <div className="text-base font-bold text-slate-900 tabular-nums">
              {monthItems.length}
              <span className="text-xs font-normal text-slate-500 ml-1">건</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500">당월 총 폐기 수량</div>
            <div className="text-base font-bold text-purple-700 tabular-nums">
              {totalQuantity}
              <span className="text-xs font-normal text-slate-500 ml-1">개</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500">최다 폐기 카테고리</div>
            <div className="text-base font-bold text-slate-800 truncate" title={topCategory}>
              {topCategory}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-bold">
          {weekDayNames.map((name, idx) => (
            <div
              key={name}
              className={`${
                idx === 0 ? 'text-rose-600' : idx === 6 ? 'text-blue-600' : 'text-slate-600'
              }`}
            >
              {name}요일
            </div>
          ))}
        </div>

        {/* Day cells grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {calendarCells.map((cell) => {
            const dayItems = itemsByDate[cell.dateStr] || [];
            const dayQuantity = dayItems.reduce((acc, c) => acc + c.quantity, 0);
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={cell.dateStr}
                onClick={() => onSelectDate(cell.dateStr)}
                className={`group relative min-h-[110px] sm:min-h-[125px] p-2 sm:p-2.5 transition-all flex flex-col justify-between cursor-pointer ${
                  cell.isCurrentMonth ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/40 text-slate-400'
                } ${isToday ? 'ring-2 ring-teal-500 ring-inset bg-teal-50/20' : ''}`}
              >
                {/* Cell Header: Day Number and Action */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold tabular-nums rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday
                          ? 'bg-teal-600 text-white'
                          : cell.isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-100/70 px-1.5 py-0.2 rounded hidden sm:inline">
                        오늘
                      </span>
                    )}
                  </div>

                  {/* Quick Add button on hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddOnDate(cell.dateStr);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded transition-all"
                    title={`${cell.dateStr} 폐기 등록`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Day Content: Waste items preview */}
                <div className="mt-1 flex-1 flex flex-col justify-start gap-1 overflow-hidden">
                  {dayItems.length > 0 ? (
                    <>
                      {/* Day summary label */}
                      <div className="text-[11px] font-bold text-purple-700 tabular-nums">
                        <span>{dayQuantity}개 폐기</span>
                      </div>

                      {/* Item badges list (up to 2 items) */}
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 2).map((item) => {
                          const catColor =
                            CATEGORY_COLORS[item.category] || CATEGORY_COLORS['기타'];
                          return (
                            <div
                              key={item.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1 ${catColor.bg} ${catColor.text} border ${catColor.border}`}
                              title={`${item.productName} (${item.quantity}개)`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: catColor.dot }}
                              />
                              <span className="truncate">{item.productName}</span>
                              <span className="shrink-0 font-mono font-bold">x{item.quantity}</span>
                            </div>
                          );
                        })}

                        {dayItems.length > 2 && (
                          <div className="text-[10px] text-slate-500 font-medium pl-1">
                            +{dayItems.length - 2}개 더보기
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    cell.isCurrentMonth && (
                      <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-40 text-[10px] text-slate-400">
                        클릭하여 등록
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
