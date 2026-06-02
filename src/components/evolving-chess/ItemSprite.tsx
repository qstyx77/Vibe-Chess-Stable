
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
 * Renders an item from the 16-column sprite sheet using background-image.
 * This is the most reliable way to "slice" a local sprite sheet asset.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Use the local URL from the placeholder config
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("shrink-0 inline-block bg-muted/20", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        backgroundSize: `${size * cols}px ${size * rows}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
