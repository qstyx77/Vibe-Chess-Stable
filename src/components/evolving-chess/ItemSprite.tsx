
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet using absolute positioning.
 * This method is the most robust for pixel-perfect alignment as it avoids 
 * the sub-pixel rounding errors often associated with background-position percentages.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 16;
  const rows = 12;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Use a relative container with overflow hidden to "clip" the sprite sheet
  return (
    <div 
      className={cn("shrink-0 overflow-hidden relative", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
      }}
      role="img"
      aria-hidden="true"
    >
      <img
        src="/images/inventory.png"
        alt=""
        className="absolute max-w-none"
        style={{
          // Scale image so that 1 unit (100%) equals exactly 1 column width
          width: '1600%', 
          height: '1200%',
          // Discrete shifting: -100% shifts by exactly 1 item width
          left: `-${col * 100}%`,
          top: `-${row * 100}%`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
