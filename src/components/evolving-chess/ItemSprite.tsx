
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
 * Optimized for pixel-perfect alignment by using a fixed 10x10 viewport
 * and CSS scaling to prevent sub-pixel drift and rounding errors.
 */
export function ItemSprite({ index, size = 10, className }: ItemSpriteProps) {
  const cols = 134;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Full sheet dimensions at native 1x scale (10px units)
  const sheetWidth = 1340;
  const sheetHeight = 650;
  
  return (
    <div 
      className={cn("shrink-0 overflow-hidden flex items-center justify-center bg-white/10", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* 
          Internal viewport is locked to native 10x10.
          We use transform scale to fit it to the container 'size'.
          This ensures the background-position stays on integer pixel boundaries.
      */}
      <div 
        style={{
          width: '10px',
          height: '10px',
          transform: `scale(${size / 10})`,
          transformOrigin: 'center',
          flexShrink: 0,
          backgroundImage: 'url(/images/spritesheet.png)',
          backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
          backgroundPosition: `-${col * 10}px -${row * 10}px`,
          imageRendering: 'pixelated',
          backgroundColor: 'transparent',
        }}
      />
    </div>
  );
}
