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
 * Renders an item from the 16-column sprite sheet using robust percentage positioning.
 * This method ensures that each 16x16 source tile is perfectly centered in the container,
 * preventing "bleeding" or the "4 corners" effect often seen with pixel offsets.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12; // Standard size for this specific sheet
  
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Percentage positioning formula: (index / (total_indices - 1)) * 100%
  // This anchors the background exactly to the tile boundaries.
  const posX = (col / (cols - 1)) * 100;
  const posY = (row / (rows - 1)) * 100;
  
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        // 1600% width means the image is 16 times wider than the container (16 columns)
        // 1200% height means the image is 12 times taller than the container (12 rows)
        backgroundSize: '1600% 1200%',
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
