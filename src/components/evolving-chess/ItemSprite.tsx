
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
 * Uses percentage-based positioning for a 10x10 grid.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  // Calculate grid coordinates (0-9) for a 10x10 grid
  const col = index % 10;
  const row = Math.floor(index / 10);
  
  /**
   * For percentage background-position to work with sprites:
   * offset % = (index / (total_icons - 1)) * 100
   * For a 10x10 grid, the denominators are 9 (10-1).
   */
  const posX = (col * 100) / 9;
  const posY = (row * 100) / 9;

  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        // 1000% background-size means the image is 10x larger than the container
        backgroundSize: '1000% 1000%',
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'rgba(255,255,255,0.05)' // Subtle fallback visibility
      }}
      aria-hidden="true"
    />
  );
}
