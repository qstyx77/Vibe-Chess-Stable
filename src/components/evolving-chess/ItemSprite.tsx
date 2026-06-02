'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet using high-precision percentage positioning.
 * This method ensures perfect centering regardless of container scaling.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Percentage positioning formula: (current_index / (total_indices_in_axis - 1)) * 100
  // This is the most robust way to align backgrounds to a grid in CSS.
  const xPercent = (col / (cols - 1)) * 100;
  const yPercent = (row / (rows - 1)) * 100;

  return (
    <div 
      className={cn("shrink-0", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
        backgroundImage: 'url(/images/inventory.png)',
        backgroundSize: '1600% 1200%', // 16 columns by 12 rows
        backgroundPosition: `${xPercent}% ${yPercent}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat'
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
