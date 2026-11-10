import { forwardRef } from 'react';
import { cn } from './utils.js';

const buttonVariants = {
  default: 'bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-xs focus:ring-2 focus:ring-emerald-600/20',
  secondary: 'bg-white hover:bg-stone-50 text-stone-700 font-medium border border-stone-200/90 shadow-xs focus:ring-2 focus:ring-stone-400/20',
  outline: 'bg-transparent hover:bg-stone-100 text-stone-700 font-medium border border-stone-300 focus:ring-2 focus:ring-stone-400/20',
  destructive: 'bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs focus:ring-2 focus:ring-rose-500/20',
  ghost: 'bg-transparent hover:bg-stone-100 text-stone-600 hover:text-stone-900',
  accent: 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200/80 font-medium',
};

const buttonSizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  default: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5',
  icon: 'h-9 w-9 p-0 rounded-xl justify-center',
};

export const Button = forwardRef(
  ({ className = '', variant = 'default', size = 'default', disabled = false, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none select-none',
          buttonVariants[variant] || buttonVariants.default,
          buttonSizes[size] || buttonSizes.default,
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

