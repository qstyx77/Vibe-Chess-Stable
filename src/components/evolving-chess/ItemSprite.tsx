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
 * ROBUST SPRITE RENDERING:
 * Uses background-image with background-position to reliably handle
 * spritesheet slicing and scaling across all browsers.
 * Calibration: 10px wide, 12px tall grid (Panel 3 items).
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Calculate the scale factor to turn a 10px wide sprite into the target display size
  const scale = size / 10;

  return (
    <div 
      className={cn("shrink-0 inline-block overflow-hidden", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintain 10:12 aspect ratio
        backgroundImage: 'url("/images/spritesheet.png")',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        // Scale the entire 1340px sheet proportionally
        backgroundSize: `${1340 * scale}px auto`,
        // Shift the scaled sheet to align the scaled (X, Y) to the top-left
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        backgroundColor: 'black',
      }}
    />
  );
}
