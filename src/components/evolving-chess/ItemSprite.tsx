
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 1340x651 spritesheet.png.
 * Recalibrated for a high-density 134x65 grid (10x10px icons).
 * Uses absolute-positioned image shifting for mathematical accuracy and perfect centering.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 134;
  const rows = 65;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  // If no size is provided, we assume it fills the parent container.
  // The image needs to be (cols * 100)% wide to make each sprite take exactly the container width.
  return (
    <div 
      className={cn("relative shrink-0 overflow-hidden bg-white", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${cols * 100}%`,
          height: `${rows * 100}%`,
          left: `-${col * 100}%`,
          top: `-${row * 100}%`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
