import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export default function Toast({ notification, onClose }) {
  if (!notification) return null;

  const { type = 'success', message, title } = notification;

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />,
    error: <XCircle size={18} className="text-rose-600 shrink-0" />,
    warning: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
    info: <Info size={18} className="text-sky-600 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-200 bg-white text-emerald-950',
    error: 'border-rose-200 bg-white text-rose-950',
    warning: 'border-amber-200 bg-white text-amber-950',
    info: 'border-sky-200 bg-white text-sky-950',
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 fade-in duration-200">
      <div
        className={`p-4 rounded-2xl shadow-lg border flex items-start gap-3 ${
          borders[type] || borders.info
        }`}
      >
        {icons[type] || icons.info}
        <div className="flex-1 min-w-0">
          {title && <p className="text-xs font-bold leading-tight">{title}</p>}
          <p className="text-xs text-stone-700 mt-0.5 leading-relaxed">{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

