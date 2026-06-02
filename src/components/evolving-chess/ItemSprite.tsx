'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from a sprite sheet.
 * Assumes a 10x10 grid of 16x16 or 32x32 icons.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const col = index % 10;
  const row = Math.floor(index / 10);
  
  // Percentages for background-position
  const posX = (col / 9) * 100;
  const posY = (row / 9) * 100;

  return (
    <div 
      className={cn("inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: 'url(/images/items-sprite-sheet.png)',
        backgroundSize: '1000%', // 10 columns
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
      }}
      aria-hidden="true"
    />
  );
}
