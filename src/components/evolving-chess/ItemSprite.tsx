
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
 * Shifted to Rows 48-62 for visual equipment items.
 */
export function ItemSprite({ index, size = 10, className }: ItemSpriteProps) {
  const cols = 134;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Full sheet: 1340 x 651 (134 x 65 units of 10px each)
  const sheetWidth = 1340;
  const sheetHeight = 651;
  
  const scale = size / 10;

  return (
    <div 
      className={cn("shrink-0 overflow-hidden bg-white relative", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt=""
        style={{
          position: 'absolute',
          top: `-${row * 10 * scale}px`,
          left: `-${col * 10 * scale}px`,
          width: `${sheetWidth * scale}px`,
          height: `${sheetHeight * scale}px`,
          imageRendering: 'pixelated',
          maxWidth: 'none',
        }}
      />
    </div>
  );
}
