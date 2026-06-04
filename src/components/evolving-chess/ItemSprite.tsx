'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  x?: number;
  y?: number;
  size?: number;
  className?: string;
  // Fallback for old code still passing index
  index?: number; 
}

/**
 * PIXEL-PERFECT 10x10 VIEWPORT:
 * This component renders a tiny 10x10 viewport that locks to the integer grid of the spritesheet.
 * It then uses CSS scale to blow the image up. This prevents "sub-pixel drift" 
 * where the browser rounds the background position and causes black lines or bleeding.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 10;
  }

  // Calculate the scale needed to reach the desired size
  const scale = size / 10;

  return (
    <div 
      className={cn("shrink-0 flex items-center justify-center bg-transparent overflow-hidden", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <div 
        style={{
          width: '10px',
          height: '10px',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div 
          style={{
            position: 'absolute',
            width: '1340px',
            height: '651px',
            left: `-${finalX}px`,
            top: `-${finalY}px`,
            backgroundImage: 'url(/images/spritesheet.png)',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            backgroundColor: 'transparent',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
