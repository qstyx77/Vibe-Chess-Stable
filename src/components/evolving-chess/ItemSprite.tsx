'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet.
 * Uses percentage-based positioning to ensure perfect centering regardless of container size.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12; // Calibrated for the provided inventory.png
  
  // Calculate grid coordinates
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Percentage-based background position is the standard for sprite sheets.
  // It handles sub-pixel rounding much better than pixel-based offsets.
  // Formula: (current_index / (total_indices - 1)) * 100
  const xPercent = (col / (cols - 1)) * 100;
  const yPercent = (row / (rows - 1)) * 100;

  return (
    <div 
      className={cn("shrink-0 bg-transparent", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
        backgroundImage: `url("/images/inventory.png")`,
        // backgroundSize must be (cols * 100%) by (rows * 100%)
        backgroundSize: '1600% 1200%',
        backgroundPosition: `${xPercent}% ${yPercent}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
