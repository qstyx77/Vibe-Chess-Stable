
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
 * Optimized for pixel-perfect alignment by using a native 10x10 container
 * and CSS scaling to prevent sub-pixel drift and rounding errors.
 */
export function ItemSprite({ index, size = 10, className }: ItemSpriteProps) {
  const cols = 134;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Full sheet dimensions (134 x 65 units of 10px each)
  const sheetWidth = 1340;
  const sheetHeight = 651;
  
  // Nested structure for stability:
  // 1. Outer div is the dynamic size requested (e.g. 32px)
  // 2. Inner div is locked at 10px x 10px to ensure integer math for offsets
  // 3. Img uses exact pixel offsets (-X * 10px) to prevent "drifting" lines
  
  return (
    <div 
      className={cn("shrink-0 overflow-hidden bg-white flex items-center justify-center", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <div 
        style={{
          width: '10px',
          height: '10px',
          transform: `scale(${size / 10})`,
          transformOrigin: 'center',
          position: 'relative',
        }}
      >
        <img
          src="/images/spritesheet.png"
          alt=""
          style={{
            position: 'absolute',
            top: `-${row * 10}px`,
            left: `-${col * 10}px`,
            width: `${sheetWidth}px`,
            height: `${sheetHeight}px`,
            imageRendering: 'pixelated',
            maxWidth: 'none',
          }}
        />
      </div>
    </div>
  );
}
