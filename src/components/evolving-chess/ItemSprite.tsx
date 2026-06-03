'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet using mathematically precise unit offsets.
 * This technique uses background-position defined in multiples of 100% relative to 
 * the container size, ensuring every 8-bit icon is clipped perfectly without bleeding.
 */
export function ItemSprite({ index, size, className }: ItemSpriteProps) {
  const cols = 16;
  
  const col = index % cols;
  const row = Math.floor(index / cols);

  return (
    <div 
      className={cn("shrink-0", className)}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
        backgroundImage: 'url(/images/inventory.png)',
        // backgroundSize must be (columns * 100%) and (rows * 100%)
        backgroundSize: '1600% 1200%', 
        // backgroundPosition in 'calc' prevents the browser from using fuzzy percentage positioning
        backgroundPosition: `calc(${col} * -100%) calc(${row} * -100%)`,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat'
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
