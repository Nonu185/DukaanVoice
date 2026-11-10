import { cn } from './utils.js';

const badgeVariants = {
  default: 'bg-stone-100 text-stone-700 border-stone-200',
  secondary: 'bg-stone-50 text-stone-600 border-stone-200/80',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  warning: 'bg-amber-50 text-amber-800 border-amber-200/80',
  destructive: 'bg-rose-50 text-rose-700 border-rose-200/80',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
  outline: 'bg-transparent text-stone-700 border-stone-300',
  cash: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold',
  upi: 'bg-indigo-50 text-indigo-800 border-indigo-200 font-semibold',
  khata: 'bg-amber-50 text-amber-900 border-amber-200 font-semibold',
};

const badgeSizes = {
  sm: 'text-[11px] px-2 py-0.5',
  default: 'text-xs px-2.5 py-1',
  lg: 'text-sm px-3 py-1.5',
};

export function Badge({ className = '', variant = 'default', size = 'default', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium border transition-colors',
        badgeVariants[variant] || badgeVariants.default,
        badgeSizes[size] || badgeSizes.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;

