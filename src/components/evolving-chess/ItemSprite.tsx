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
 * HIGH-PRECISION CLIPPING MASK RENDERING (Idea 1)
 * Uses overflow:hidden + transform to eliminate sub-pixel drift on large sheets.
 * Optimized for 10x12 rectangular sprites.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: The items are natively 10px wide.
  const scale = size / 10;
  
  return (
    <div 
      className={cn("overflow-hidden relative inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintains 10:12 native aspect ratio
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt="Equipment Sprite"
        className="absolute max-w-none"
        style={{
          // Sheet must be scaled proportionally. Assuming standard 1340px source width.
          width: `${1340 * scale}px`,
          height: 'auto',
          // Shift image so the target sprite is in the viewport
          transform: `translate(-${x * scale}px, -${y * scale}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
