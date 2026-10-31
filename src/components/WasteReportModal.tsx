import React, { useState } from 'react';
import {
  X,
  PieChart,
  BarChart3,
  Sparkles,
  Download,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { WasteItem, AIWasteInsight, WasteCategory } from '../types/waste';
import { CATEGORY_COLORS } from '../data/presetProducts';
import { exportWasteToCSV, formatKRW } from '../utils/storage';

interface WasteReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  wasteItems: WasteItem[];
  selectedMonth: string; // e.g. "2026-10"
}

export const WasteReportModal: React.FC<WasteReportModalProps> = ({
  isOpen,
  onClose,
  wasteItems,
  selectedMonth,
}) => {
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiInsight, setAiInsight] = useState<AIWasteInsight | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter items for selected month
  const monthItems = wasteItems.filter((item) => item.date.startsWith(selectedMonth));
  const totalMonthQty = monthItems.reduce((acc, c) => acc + c.quantity, 0);
  const totalMonthRetailLoss = monthItems.reduce(
    (acc, c) => acc + c.unitPrice * c.quantity,
    0
  );
  const totalMonthCostLoss = monthItems.reduce(
    (acc, c) => acc + c.costPrice * c.quantity,
    0
  );

  // Group by category
  const categoryStats: Record<
    string,
    { qty: number; retailLoss: number; costLoss: number }
  > = {};

  monthItems.forEach((item) => {
    if (!categoryStats[item.category]) {
      categoryStats[item.category] = { qty: 0, retailLoss: 0, costLoss: 0 };
    }
    categoryStats[item.category].qty += item.quantity;
    categoryStats[item.category].retailLoss += item.unitPrice * item.quantity;
    categoryStats[item.category].costLoss += item.costPrice * item.quantity;
  });

  const sortedCategories = Object.entries(categoryStats).sort(
    (a, b) => b[1].retailLoss - a[1].retailLoss
  );

  // Group by product name for Top 5 ranking
  const productStats: Record<string, { qty: number; retailLoss: number; category: any }> = {};
  monthItems.forEach((item) => {
    if (!productStats[item.productName]) {
      productStats[item.productName] = {
        qty: 0,
        retailLoss: 0,
        category: item.category,
      };
    }
    productStats[item.productName].qty += item.quantity;
    productStats[item.productName].retailLoss += item.unitPrice * item.quantity;
  });

  const topProducts = Object.entries(productStats)
    .sort((a, b) => b[1].retailLoss - a[1].retailLoss)
    .slice(0, 5);

  // Group by time slots
  const timeSlotStats: Record<string, number> = {
    '02:00': 0,
    '14:00': 0,
    '20:00': 0,
    '22:00': 0,
    '수시/기타': 0,
  };
  monthItems.forEach((item) => {
    const slot = timeSlotStats[item.disposalTime] !== undefined ? item.disposalTime : '수시/기타';
    timeSlotStats[slot] = (timeSlotStats[slot] || 0) + item.quantity;
  });

  // Request AI Consultation from server
  const handleRequestAIInsight = async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/waste-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          wasteLogs: monthItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI 발주 진단 생성에 실패했습니다.');
      }

      const data = await res.json();
      setAiInsight(data.insight);
    } catch (e: any) {
      console.warn('AI insight error:', e);
      setAiError(e.message || 'AI 발주 진단 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              {selectedMonth} 편의점 폐기 손실 분석 리포트
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              월간 카테고리별 손실액, 최다 폐기 상품, AI 발주 최적화 가이드
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500">당월 총 폐기 건수 / 수량</span>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {monthItems.length}건 / {totalMonthQty}개
              </div>
            </div>

            <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200">
              <span className="text-xs font-medium text-rose-700">판매가 기준 폐기 손실액</span>
              <div className="text-xl font-bold text-rose-600 mt-1 tabular-nums">
                {formatKRW(totalMonthRetailLoss)}
              </div>
            </div>

            <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200">
              <span className="text-xs font-medium text-amber-800">원가 기준 순손실 (점주 부담)</span>
              <div className="text-xl font-bold text-amber-700 mt-1 tabular-nums">
                {formatKRW(totalMonthCostLoss)}
              </div>
            </div>
          </div>

          {/* AI Store Consultant Box */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-50 via-slate-50 to-emerald-50 border border-teal-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  AI 스마트 발주 조정 & 폐기 감축 진단
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRequestAIInsight}
                disabled={isGeneratingAi}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg transition-all shadow-2xs disabled:opacity-60"
              >
                {isGeneratingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    AI 분석 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {aiInsight ? '진단 새로고침' : 'AI 발주 진단받기'}
                  </>
                )}
              </button>
            </div>

            {aiError && (
              <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {aiError}
              </div>
            )}

            {aiInsight ? (
              <div className="space-y-3 pt-2 text-xs">
                <div className="p-3 bg-white rounded-xl border border-teal-200 font-semibold text-teal-900">
                  💡 {aiInsight.headline} (예상 손실 감축: 약 {aiInsight.estimatedSavingPercent}%)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block">📊 최다 손실 분석</span>
                    <p className="text-slate-600 leading-relaxed">
                      {aiInsight.topLossCategoryAnalysis}
                    </p>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block">📦 발주 수량 조절</span>
                    <p className="text-slate-600 leading-relaxed">
                      {aiInsight.orderAdjustmentTip}
                    </p>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block">🏷️ 마감할인 팁</span>
                    <p className="text-slate-600 leading-relaxed">
                      {aiInsight.clearanceRecommendation}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                이번 달 폐기 내역을 바탕으로 인공지능이 과발주 품목을 진단하고, 폐기율을 15~25% 낮출 수 있는 발주 가이드를 제시합니다.
              </p>
            )}
          </div>

          {/* Category Loss Distribution & Top 5 Products */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Distribution */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-slate-600" />
                카테고리별 폐기 손실 순위
              </h3>
              <div className="space-y-2">
                {sortedCategories.map(([cat, stat]) => {
                  const percentage = totalMonthRetailLoss
                    ? Math.round((stat.retailLoss / totalMonthRetailLoss) * 100)
                    : 0;
                  const catColor =
                    CATEGORY_COLORS[cat as WasteCategory] || CATEGORY_COLORS['기타'];

                  return (
                    <div
                      key={cat}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: catColor.dot }}
                          />
                          {cat}
                        </span>
                        <span className="font-bold text-rose-600 tabular-nums">
                          {formatKRW(stat.retailLoss)} ({stat.qty}개 / {percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: catColor.dot,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top 5 Most Wasted Products */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                최다 폐기 상품 TOP 5 (손실액 순)
              </h3>
              <div className="space-y-2">
                {topProducts.map(([name, stat], index) => {
                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-[10px] shrink-0 font-mono">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 truncate">{name}</div>
                          <div className="text-[10px] text-slate-500">{stat.category}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <div className="font-bold text-rose-600 tabular-nums">
                          {formatKRW(stat.retailLoss)}
                        </div>
                        <div className="text-[10px] text-slate-500 tabular-nums">
                          총 {stat.qty}개 폐기
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Time Slot Distribution */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800">폐기 발생 시간대 분포</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(timeSlotStats).map(([slot, qty]) => (
                <div key={slot} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <div className="text-[11px] font-mono text-slate-500">{slot}</div>
                  <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                    {qty}
                    <span className="text-xs font-normal text-slate-500 ml-1">개</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => exportWasteToCSV(monthItems, `편의점폐기대장_${selectedMonth}.csv`)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors shadow-2xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
            엑셀/CSV 내보내기
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
