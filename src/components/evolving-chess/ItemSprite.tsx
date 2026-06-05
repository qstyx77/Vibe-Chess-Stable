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
 * HIGH-PRECISION ABSOLUTE TRANSLATION RENDERING
 * Treats the 1340px sheet as a global coordinate space.
 * Uses integer scaling for 8-bit precision.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: The native sprite width is 10px.
  // Using absolute pixel scaling to prevent sub-pixel blurring.
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
          // Move the entire sheet to point to the top-left of the specific sprite.
          transform: `translate(-${x * scale}px, -${y * scale}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
