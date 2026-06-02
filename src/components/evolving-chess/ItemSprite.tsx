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
 * Renders an item from the 16-column sprite sheet.
 * Uses calc-based positioning to shift the background by exact container-width multiples.
 * This is the most reliable method for pixel-perfect sprite slicing in browsers.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("shrink-0 inline-block overflow-hidden", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        // 1600% means the image is 16 times wider than the container (matching 16 columns)
        backgroundSize: '1600% auto',
        // Shift left/up by 100% of the container size for each column/row index
        backgroundPosition: `calc(${col} * -100%) calc(${row} * -100%)`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
