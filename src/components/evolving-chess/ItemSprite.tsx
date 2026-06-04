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
 * 10x10 VIEWPORT RENDERING:
 * Lock the rendering to a 10px box before scaling.
 * Uses exact pixel coordinates from the 1340x651 spritesheet.
 * This definitively solves sub-pixel drift and black lines.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  // Logic for raw coordinates vs legacy index
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 10;
  }

  return (
    <div 
      className={cn("shrink-0 overflow-hidden flex items-center justify-center bg-transparent", className)}
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
          flexShrink: 0,
          backgroundImage: 'url(/images/spritesheet.png)',
          backgroundSize: '1340px 651px',
          backgroundPosition: `-${finalX}px -${finalY}px`,
          imageRendering: 'pixelated',
          backgroundColor: 'transparent',
        }}
      />
    </div>
  );
}
