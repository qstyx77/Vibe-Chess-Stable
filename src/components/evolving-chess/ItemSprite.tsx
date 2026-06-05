'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  x?: number;
  y?: number;
  size?: number;
  className?: string;
}

/**
 * HIGH-PRECISION CLIPPING MASK RENDERING
 * Uses absolute pixel translation (translate) to move the sheet behind a masked window.
 * This method is immune to the sub-pixel rounding errors found in background-position.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: The native sprite width is 10px.
  // We use integer-safe scaling to keep the pixels sharp.
  const scale = size / 10;
  
  return (
    <div 
      className={cn("overflow-hidden relative inline-block shrink-0 bg-transparent", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintains 10:12 native aspect ratio
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt="Item Sprite"
        className="absolute max-w-none"
        style={{
          width: `${1340 * scale}px`,
          height: 'auto',
          // Move the entire sheet using exact pixel values.
          // We negate the coordinates to pull the target sprite into view.
          transform: `translate(-${x * scale}px, -${y * scale}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
