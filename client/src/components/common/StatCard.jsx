import { cn } from '../ui/utils.js';

export default function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  iconColor = 'text-stone-700',
  iconBg = 'bg-stone-50 border-stone-200/80',
  trend,
  trendPositive = true,
  onClick,
  badge,
  className = '',
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'h-full flex flex-col justify-between bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs transition-colors duration-150',
        onClick ? 'cursor-pointer hover:border-emerald-300' : '',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium text-stone-500 leading-snug">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-stone-900 tabular-nums leading-tight">
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-xl border flex items-center justify-center shrink-0',
              iconBg,
              iconColor
            )}
          >
            <Icon size={18} className="stroke-[1.9]" />
          </div>
        )}
      </div>

      {(subtext || trend || badge) && (
        <div className="mt-4 flex items-center justify-between gap-2 text-xs pt-3 border-t border-stone-100">
          <div className="flex items-center gap-1.5 min-w-0">
            {trend && (
              <span
                className={cn(
                  'font-semibold shrink-0',
                  trendPositive ? 'text-emerald-700' : 'text-rose-600'
                )}
              >
                {trend}
              </span>
            )}
            {subtext && <span className="text-stone-500 truncate">{subtext}</span>}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}
    </div>
  );
}
