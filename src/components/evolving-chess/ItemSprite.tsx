
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
 * Renders an item from the uploaded sprite sheet.
 * The provided sheet is 256x192, containing 16x12 icons (16px each).
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  // Calculate grid coordinates for a 16-column grid
  const cols = 16;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  /**
   * For percentage background-position to work correctly:
   * x% = (col * 100) / (total_cols - 1)
   * y% = (row * 100) / (total_rows - 1)
   */
  const posX = (col * 100) / (cols - 1);
  const posY = (row * 100) / (12 - 1); // 12 rows total

  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        // 1600% background-size because the image is 16 icons wide
        backgroundSize: '1600% auto',
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      aria-hidden="true"
    />
  );
}
