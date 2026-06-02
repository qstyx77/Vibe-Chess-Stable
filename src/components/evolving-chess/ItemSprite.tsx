
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
 * Renders an item from the 16-column sprite sheet using percentage-based background positioning.
 * This is the most resilient way to handle sprite sheets with different icon sizes and browser scaling.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12; // Assuming a 12-row sheet based on common asset packs
  
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Calculate percentage positions: (current_index / (total_items_in_axis - 1)) * 100
  // This maps the 0-100% background-position range perfectly to the grid cells.
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
        // 1600% means the background image is 16 times the width of the container
        backgroundSize: `${cols * 100}% auto`,
        backgroundPosition: `${posX}% ${posY}%`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
