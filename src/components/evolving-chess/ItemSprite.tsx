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
 * Renders an item from the 16-column sprite sheet using precise pixel offsets.
 * Using pixel-based background-position and background-size is the most robust way
 * to prevent the "4 corners" or "bleeding" effect seen with percentage-based slicing.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // We scale the background sheet such that one tile equals the 'size' prop.
  // This ensures that shifting the background by exactly 'size' pixels moves us by one icon.
  const sheetWidth = size * cols;
  const posX = -(col * size);
  const posY = -(row * size);
  
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        backgroundSize: `${sheetWidth}px auto`,
        backgroundPosition: `${posX}px ${posY}px`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
