'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 67x31 spritesheet.png using exact percentage offsets.
 * Percentage background-position: X% means (containerWidth - imageWidth) * (X / 100).
 * For sprite sheets, (pos / (total - 1)) * 100 perfectly aligns the center of each tile.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 67;
  const rows = 31;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // High-precision percentage positioning formula for anchored sprites
  const posX = (col / (cols - 1)) * 100;
  const posY = (row / (rows - 1)) * 100;

  return (
    <div 
      className={cn("shrink-0", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
        backgroundImage: 'url(/images/spritesheet.png)',
        // backgroundSize must be exactly (columns * 100%) and (rows * 100%)
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat'
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
