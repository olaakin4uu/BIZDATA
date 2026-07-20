import React from 'react';

/**
 * The standard content container. Gives every page one consistent max-width,
 * responsive gutter, and vertical rhythm instead of each page inventing its own
 * `p-6 max-w-7xl mx-auto`. Pass `width="wide"` for data-dense screens that need
 * the room, or `bleed` for full-bleed layouts that manage their own padding.
 */
export interface PageContainerProps {
  children: React.ReactNode;
  width?: 'default' | 'wide' | 'narrow';
  bleed?: boolean;
  className?: string;
}

const WIDTH: Record<NonNullable<PageContainerProps['width']>, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-7xl',
  wide: 'max-w-[96rem]',
};

export function PageContainer({ children, width = 'default', bleed = false, className = '' }: PageContainerProps) {
  if (bleed) return <div className={className}>{children}</div>;
  return <div className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 ${WIDTH[width]} ${className}`}>{children}</div>;
}

export default PageContainer;
