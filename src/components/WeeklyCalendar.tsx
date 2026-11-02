import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Package,
  Barcode,
  LayoutGrid,
  AlignLeft,
  CalendarDays,
  Clock,
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
  // View mode: 'columns' (7 days side-by-side horizontally in 7 columns) or 'rows' (7 days as horizontal rows)
  const [viewMode, setViewMode] = useState<'columns' | 'rows'>('columns');

  // Let's use Sunday as starting day of the week
  const startOfWeek = new Date(currentDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  // Generate 7 days for this week (Sunday to Saturday)
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
      isSunday: i === 0,
      isSaturday: i === 6,
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
      {/* Week Navigation & Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Nav controls */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigateWeek(-1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
              title="이전 주"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateWeek(1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
              title="다음 주"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
              {weekDays[0].monthNum}월 {weekDays[0].dayNum}일 ~ {weekDays[6].monthNum}월{' '}
              {weekDays[6].dayNum}일
            </h2>
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
              <CalendarDays className="w-3.5 h-3.5 text-purple-600" />
              <span>1주일 가로 캘린더 (일요일 ~ 토요일)</span>
            </div>
          </div>

          <button
            onClick={onSelectToday}
            className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
          >
            이번 주
          </button>

          {/* View Mode Toggle: 7열 가로 뷰 vs 가로 행 뷰 */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 ml-auto sm:ml-2">
            <button
              type="button"
              onClick={() => setViewMode('columns')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                viewMode === 'columns'
                  ? 'bg-white text-purple-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="7일 가로 나란히 뷰 (7열 컬럼)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>가로 7열 뷰</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('rows')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                viewMode === 'rows'
                  ? 'bg-white text-purple-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="요일별 가로 타임라인 뷰 (행)"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>가로 행 뷰</span>
            </button>
          </div>
        </div>

        {/* Weekly metrics */}
        <div className="grid grid-cols-3 gap-3 lg:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
          <div>
            <div className="text-[11px] font-medium text-slate-500">주간 폐기 품목</div>
            <div className="text-base font-bold text-slate-900 tabular-nums">
              {weekItems.length}
              <span className="text-xs font-normal text-slate-500 ml-1">건</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500">주간 총 폐기 수량</div>
            <div className="text-base font-bold text-purple-700 tabular-nums">
              {totalWeekQty}
              <span className="text-xs font-normal text-slate-500 ml-1">개</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500">최다 폐기 요일</div>
            <div className="text-base font-bold text-slate-800 tabular-nums">
              {worstDayStr}
            </div>
          </div>
        </div>
      </div>

      {/* MODE 1: 7-Day Horizontal Side-by-Side Layout (일요일 ~ 토요일 가로 7열로 1주일이 한눈에 나란히 펼쳐짐) */}
      {viewMode === 'columns' && (
        <div className="bg-slate-50/50 p-2 sm:p-3 rounded-2xl border border-slate-200">
          {/* Subtle scroll guide indicator if screen is narrow */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 pb-2 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600 inline-block animate-pulse" />
              1주일(7일) 가로 캘린더 배치
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              ← 화면이 좁을 경우 좌우로 부드럽게 스크롤하여 7일을 확인하세요 →
            </span>
          </div>

          <div className="overflow-x-auto pb-3 custom-scrollbar">
            <div className="grid grid-cols-7 gap-3 min-w-[1120px]">
              {weekDays.map((w, idx) => {
                const dayItems = wasteItems.filter((i) => i.date === w.dateStr);
                const dayQty = dayItems.reduce((acc, c) => acc + c.quantity, 0);
                const isToday = w.dateStr === todayStr;

                return (
                  <div
                    key={w.dateStr}
                    className={`flex flex-col bg-white rounded-2xl border transition-all ${
                      isToday
                        ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                        : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    {/* Day Header */}
                    <div
                      onClick={() => onSelectDate(w.dateStr)}
                      className={`p-3 border-b cursor-pointer transition-colors rounded-t-2xl ${
                        isToday
                          ? 'bg-teal-50/70 border-teal-200 hover:bg-teal-50'
                          : 'bg-slate-50/70 border-slate-100 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            w.isSunday
                              ? 'text-rose-600'
                              : w.isSaturday
                              ? 'text-blue-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {w.dayName}요일
                        </span>
                        {isToday ? (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                            오늘
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {w.monthNum}.{w.dayNum}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-lg font-bold text-slate-900 tabular-nums">
                          {w.dayNum}일
                        </span>
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            dayQty > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {dayQty > 0 ? `${dayQty}개` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Day Content: Items list */}
                    <div className="flex-1 p-2 space-y-2 min-h-[380px] max-h-[540px] overflow-y-auto custom-scrollbar">
                      {dayItems.length === 0 ? (
                        <div className="h-44 flex flex-col items-center justify-center text-center p-3 text-slate-400 text-xs">
                          <Package className="w-6 h-6 mb-1 text-slate-300 stroke-1" />
                          <span>폐기 등록 없음</span>
                        </div>
                      ) : (
                        dayItems.map((item) => {
                          const catColor =
                            CATEGORY_COLORS[item.category] || CATEGORY_COLORS['기타'];

                          return (
                            <div
                              key={item.id}
                              className={`p-2.5 rounded-xl border text-xs relative group/item bg-white hover:shadow-xs transition-all ${catColor.border}`}
                            >
                              {/* Top row: Product Name & Delete */}
                              <div className="flex items-start justify-between gap-1">
                                <div
                                  className="font-semibold text-slate-800 leading-tight text-xs flex-1 line-clamp-2"
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
                                  className="opacity-0 group-hover/item:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity shrink-0 cursor-pointer"
                                  title="삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Barcode Number: Dedicated full row, 100% visible and selectable */}
                              <div
                                className="mt-1.5 flex items-center gap-1 font-mono text-[10.5px] bg-slate-50 px-1.5 py-1 rounded border border-slate-200/90 text-slate-700 w-full"
                                title={`바코드: ${item.barcode || '바코드 없음'}`}
                              >
                                <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold tracking-tight tabular-nums break-all select-all leading-tight">
                                  {item.barcode || '바코드 없음'}
                                </span>
                              </div>

                              {/* Footer: Quantity & Reason/Time */}
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-[11px]">
                                <span className="font-bold text-purple-700 font-mono">
                                  {item.quantity}개
                                </span>
                                {item.disposalTime && (
                                  <span className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5 text-slate-400" />
                                    {item.disposalTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bottom Quick Add on this date */}
                    <div className="p-2 border-t border-slate-100 bg-slate-50/40 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() => onAddOnDateAndTime(w.dateStr, '')}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 rounded-lg transition-colors cursor-pointer"
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
        </div>
      )}

      {/* MODE 2: Horizontal Day Rows (각 요일별 가로 행으로 펼쳐진 타임라인) */}
      {viewMode === 'rows' && (
        <div className="space-y-3">
          {weekDays.map((w) => {
            const dayItems = wasteItems.filter((i) => i.date === w.dateStr);
            const dayQty = dayItems.reduce((acc, c) => acc + c.quantity, 0);
            const isToday = w.dateStr === todayStr;

            return (
              <div
                key={w.dateStr}
                className={`bg-white rounded-2xl border transition-all p-4 ${
                  isToday
                    ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                    : 'border-slate-200 shadow-2xs hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Left: Date Badge */}
                  <div
                    onClick={() => onSelectDate(w.dateStr)}
                    className={`w-full md:w-36 shrink-0 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isToday
                        ? 'bg-teal-50/80 border-teal-200'
                        : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-bold ${
                          w.isSunday
                            ? 'text-rose-600'
                            : w.isSaturday
                            ? 'text-blue-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {w.dayName}요일
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                          오늘
                        </span>
                      )}
                    </div>
                    <div className="text-base font-bold text-slate-900 mt-1">
                      {w.monthNum}월 {w.dayNum}일
                    </div>
                    <div className="mt-2 text-xs font-semibold text-rose-600">
                      총 {dayQty}개 폐기
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddOnDateAndTime(w.dateStr, '');
                      }}
                      className="mt-2.5 w-full flex items-center justify-center gap-1 py-1 text-[11px] font-semibold text-purple-700 bg-white hover:bg-purple-50 border border-purple-200 rounded-md transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      등록
                    </button>
                  </div>

                  {/* Right: Horizontally arranged items */}
                  <div className="flex-1 overflow-x-auto pb-1 custom-scrollbar">
                    {dayItems.length === 0 ? (
                      <div className="py-6 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                        <Package className="w-4 h-4 mr-1.5 text-slate-300 stroke-1" />
                        <span>등록된 폐기 상품이 없습니다.</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {dayItems.map((item) => {
                          const catColor =
                            CATEGORY_COLORS[item.category] || CATEGORY_COLORS['기타'];

                          return (
                            <div
                              key={item.id}
                              className={`p-3 rounded-xl border bg-white text-xs hover:shadow-xs transition-all relative group min-w-[210px] max-w-[260px] flex-1 ${catColor.border}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-semibold text-slate-900 truncate" title={item.productName}>
                                  {item.productName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`'${item.productName}' 폐기 내역을 삭제하시겠습니까?`)) {
                                      onDeleteItem(item.id);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                                  title="삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="break-all select-all font-semibold">{item.barcode || '바코드 없음'}</span>
                              </div>

                              <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[11px]">
                                <span className="font-bold text-purple-700">
                                  수량: {item.quantity}개
                                </span>
                                {item.disposalTime && (
                                  <span className="text-slate-400 font-mono text-[10px]">
                                    {item.disposalTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
