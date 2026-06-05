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
 * ROBUST SPRITE RENDERING:
 * Uses background-image with background-position to reliably handle
 * spritesheet slicing and scaling across all browsers.
 * Viewport is locked to the 10x12 rectangular grid identified in Panel 3.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls (134 columns)
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 12;
  }

  // Calculate the scale factor to turn a 10px wide sprite into the target size
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
        backgroundPosition: `-${finalX * scale}px -${finalY * scale}px`,
        backgroundColor: 'black',
      }}
    />
  );
}
