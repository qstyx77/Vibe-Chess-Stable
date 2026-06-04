
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 1340x651 spritesheet.png.
 * Optimized for pixel-perfect 10x10 icons using exact pixel units to avoid sub-pixel drift.
 */
export function ItemSprite({ index, size = 10, className }: ItemSpriteProps) {
  const cols = 134;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Using background-position with exact pixel values to prevent technically-induced drift.
  // We set background-size to the full sheet dimensions scaled to our target sprite size.
  // Full sheet: 1340 x 651 (134 x 65 units of 10px each)
  const sheetWidth = 1340;
  const sheetHeight = 651;
  
  // To scale the sprite to the requested size while maintaining alignment,
  // we use a transform: scale if the size is not 10.
  const scale = size / 10;

  return (
    <div 
      className={cn("shrink-0 overflow-hidden bg-white", className)}
      style={{
        width: '10px',
        height: '10px',
        backgroundImage: 'url(/images/spritesheet.png)',
        backgroundPosition: `-${col * 10}px -${row * 10}px`,
        backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
        imageRendering: 'pixelated',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    />
  );
}
