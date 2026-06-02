'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16-column sprite sheet.
 * Uses exact pixel-based offsets to prevent the "4 corners" bleeding effect.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  
  // Calculate grid coordinates
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Use the verified local path
  const spriteSheetUrl = "/images/inventory.png";

  return (
    <div 
      className={cn("shrink-0 inline-block overflow-hidden bg-transparent", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url("${spriteSheetUrl}")`,
        // Scale the background so each "cell" is exactly 'size' pixels wide
        backgroundSize: `${cols * size}px auto`,
        // Shift by exact pixel multiples to ensure alignment
        backgroundPosition: `-${col * size}px -${row * size}px`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
