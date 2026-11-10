/**
 * Simple, dependency-free utility to merge class names cleanly.
 */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

