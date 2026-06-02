
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
 * Assumes a 10x10 grid of icons.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  // Calculate grid coordinates (10x10 grid)
  const col = index % 10;
  const row = Math.floor(index / 10);
  
  // Use pixel offsets for more reliable "slicing" of the background image
  // We set the background-size to 10x the requested icon size (for a 10x10 grid)
  const bgSize = size * 10;
  const posX = -(col * size);
  const posY = -(row * size);

  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("inline-block shrink-0", className)}
      data-ai-hint="sprite sheet"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${spriteSheetUrl})`,
        backgroundSize: `${bgSize}px ${bgSize}px`,
        backgroundPosition: `${posX}px ${posY}px`,
        imageRendering: 'pixelated',
        backgroundColor: 'rgba(255,255,255,0.05)',
        backgroundRepeat: 'no-repeat'
      }}
      aria-hidden="true"
    />
  );
}
