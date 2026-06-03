'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 67x31 spritesheet.png using a clipped image tag method.
 * This approach is extremely robust for large sprite sheets and scales precisely
 * to fill the container slots.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 67;
  const rows = 31;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Position the image so the desired sprite is visible in the container
  // We shift by -100% of the container size for each column/row index
  const left = -(col * 100);
  const top = -(row * 100);

  return (
    <div 
      className={cn("relative overflow-hidden shrink-0", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt=""
        className="absolute max-w-none pointer-events-none"
        style={{
          width: `${cols * 100}%`,
          height: `${rows * 100}%`,
          left: `${left}%`,
          top: `${top}%`,
          imageRendering: 'pixelated',
        }}
        draggable={false}
        aria-hidden="true"
      />
    </div>
  );
}
