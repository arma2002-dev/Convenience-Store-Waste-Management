import React from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Package,
} from 'lucide-react';
import { WasteItem } from '../types/waste';
import { CATEGORY_COLORS } from '../data/presetProducts';

interface DayDetailModalProps {
  isOpen: boolean;
  dateStr: string | null;
  items: WasteItem[];
  onClose: () => void;
  onAddOnDate: (dateStr: string) => void;
  onDeleteItem: (id: string) => void;
  onUpdateQuantity: (id: string, newQty: number) => void;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  isOpen,
  dateStr,
  items,
  onClose,
  onAddOnDate,
  onDeleteItem,
  onUpdateQuantity,
}) => {
  if (!isOpen || !dateStr) return null;

  // Format date display
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
  const formattedDate = `${dateObj.getFullYear()}년 ${
    dateObj.getMonth() + 1
  }월 ${dateObj.getDate()}일 (${dayName}요일)`;

  const totalQuantity = items.reduce((acc, cur) => acc + cur.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              {formattedDate} 폐기 내역
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              해당 일자에 발생한 폐기 항목 및 수량 확인/수정
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Day Summary banner */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-100/70 border-b border-slate-200 text-center">
          <div>
            <div className="text-[11px] font-medium text-slate-500">등록 품목</div>
            <div className="text-base font-bold text-slate-900 tabular-nums">
              {items.length}건
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">총 폐기 수량</div>
            <div className="text-base font-bold text-purple-700 tabular-nums">
              {totalQuantity}개
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {items.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Package className="w-12 h-12 text-slate-300 stroke-1 mb-2" />
              <p className="text-sm font-semibold text-slate-700">등록된 폐기 내역이 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">
                바코드 스캔 또는 직접 입력으로 폐기 상품을 등록해보세요.
              </p>
              <button
                type="button"
                onClick={() => onAddOnDate(dateStr)}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                이 날짜에 폐기 등록하기
              </button>
            </div>
          ) : (
            items.map((item) => {
              const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS['기타'];

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all gap-4"
                >
                  {/* Left: Product Info */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {item.photoUrl ? (
                      <img
                        src={item.photoUrl}
                        alt={item.productName}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: `${catColor.dot}20`,
                          color: catColor.dot,
                        }}
                      >
                        {item.category.slice(0, 2)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${catColor.bg} ${catColor.text} border ${catColor.border}`}
                        >
                          {item.category}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.barcode}
                        </span>
                        {item.disposalTime && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                            <Clock className="w-3 h-3 text-purple-600" />
                            {item.disposalTime}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 mt-1 truncate">
                        {item.productName}
                      </h4>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span>사유: {item.reason}</span>
                        {item.notes && <span>· {item.notes}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quantity Adjuster & Delete Action */}
                  <div className="flex items-center justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-bold tabular-nums text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="폐기 내역 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => onAddOnDate(dateStr)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            이 날짜에 폐기 추가
          </button>
        </div>
      </div>
    </div>
  );
};
