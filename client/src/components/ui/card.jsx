import { forwardRef } from 'react';
import { cn } from './utils.js';

export const Card = forwardRef(({ className = '', children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-white rounded-2xl border border-stone-200/80 shadow-xs transition-all duration-150',
      className
    )}
    {...props}
  >
    {children}
  </div>
));
Card.displayName = 'Card';

export const CardHeader = forwardRef(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 sm:p-6 pb-3 sm:pb-4', className)} {...props}>
    {children}
  </div>
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef(({ className = '', children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-base sm:text-lg font-bold tracking-tight text-stone-900', className)}
    {...props}
  >
    {children}
  </h3>
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef(({ className = '', children, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs sm:text-sm text-stone-500 mt-1', className)} {...props}>
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 sm:p-6 pt-0', className)} {...props}>
    {children}
  </div>
));
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef(({ className = '', children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('p-5 sm:p-6 pt-0 border-t border-stone-100 flex items-center justify-between', className)}
    {...props}
  >
    {children}
  </div>
));
CardFooter.displayName = 'CardFooter';

export default Card;

