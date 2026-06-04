
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
 * Optimized for pixel-perfect alignment using a fixed 10x10 viewport.
 * This eliminates the sub-pixel "drift" (black lines) seen in large sheets.
 */
export function ItemSprite({ index, size = 10, className }: ItemSpriteProps) {
  const cols = 134;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Sheet dimensions at native 1x scale
  const sheetWidth = 1340;
  const sheetHeight = 650;
  
  return (
    <div 
      className={cn("shrink-0 overflow-hidden flex items-center justify-center bg-transparent", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* 
          10x10 FIXED VIEWPORT:
          We render the sprite at exactly 10px and then scale the entire result.
          This prevents the browser from doing fractional math on the background-position,
          which is what causes the "bleeding" and "black lines".
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
