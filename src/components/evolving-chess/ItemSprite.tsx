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
 * RECTANGULAR VIEWPORT RENDERING:
 * Uses a fixed 10x12 pixel grid as identified in the zoomed reference.
 * This prevents clipping of items like shields and cloaks that are taller than 10px.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls (134 columns)
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 12; // Native 12px row height
  }

  // Calculate scaling based on width (size prop)
  const scale = size / 10;

  return (
    <div 
      className={cn("overflow-hidden shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintain 10:12 aspect ratio
        background: 'black',
      }}
    >
      <div 
        style={{
          width: '10px',
          height: '12px',
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
            // Physical translation within the 10x12 window
            transform: `translate(-${finalX}px, -${finalY}px)`,
          }}
        />
      </div>
    </div>
  );
}
