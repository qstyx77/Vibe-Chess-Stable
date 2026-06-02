
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import placeholderImages from '@/app/lib/placeholder-images.json';

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
  
  // Percentages for background-position to slice a 10x10 grid
  // (index / (total - 1)) * 100
  const posX = (col / 9) * 100;
  const posY = (row / 9) * 100;

  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("inline-block", className)}
      data-ai-hint="sprite sheet"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${spriteSheetUrl})`,
        backgroundSize: '1000%', // 10 columns = 1000% of container width
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundColor: 'rgba(255,255,255,0.05)' // Subtle fallback
      }}
      aria-hidden="true"
    />
  );
}
