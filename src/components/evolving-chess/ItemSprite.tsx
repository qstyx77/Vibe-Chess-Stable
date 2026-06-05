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
 * Instead of background-math (which drifts), we use a 10x10px div
 * that acts as a physical window. The image is moved inside using 
 * pixel-accurate translation and then the entire window is scaled.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls (134 columns)
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 10;
  }

  const scale = size / 10;

  return (
    <div 
      className={cn("overflow-hidden shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: 'black', // Force black background to prevent theme inversion leakage
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
            transform: `translate(-${finalX}px, -${finalY}px)`,
          }}
        />
      </div>
    </div>
  );
}
