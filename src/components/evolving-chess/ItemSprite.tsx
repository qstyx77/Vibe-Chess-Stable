'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  x?: number;
  y?: number;
  size?: number;
  className?: string;
  // Legacy support
  index?: number; 
}

/**
 * PHYSICAL VIEWPORT RENDERING:
 * Optimized for a 10x12 pixel grid as identified in the zoomed reference.
 * Uses a fixed 10x10 viewport that centers the 12px tall sprites.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls (134 columns)
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 12; // Adjust for 12px row height
  }

  const scale = size / 10;

  return (
    <div 
      className={cn("overflow-hidden shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: 'black', // Force black background for 8-bit clarity
      }}
    >
      <div 
        style={{
          width: '10px',
          height: '10px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <img 
          src="/images/spritesheet.png"
          alt=""
          style={{
            display: 'block',
            maxWidth: 'none',
            width: '1340px',
            height: '651px',
            imageRendering: 'pixelated',
            // Shift Y by 1px to center the 12px tall sprite in the 10px window
            transform: `translate(-${finalX}px, -${finalY + 1}px)`,
          }}
        />
      </div>
    </div>
  );
}
