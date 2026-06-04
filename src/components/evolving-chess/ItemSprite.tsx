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
 * PIXEL-PERFECT BACKGROUND SCALING:
 * This technique locks the background size and position to integer multiples
 * of the source coordinates. This prevents the browser from doing fractional
 * math which causes sub-pixel drift, blurry edges, or neighboring sprite bleeding.
 */
export function ItemSprite({ x, y, index, size = 10, className }: ItemSpriteProps) {
  let finalX = x ?? 0;
  let finalY = y ?? 0;

  // Handle legacy index-based calls for safety
  if (index !== undefined && x === undefined) {
    const cols = 134;
    finalX = (index % cols) * 10;
    finalY = Math.floor(index / cols) * 10;
  }

  // Calculate the scale factor (e.g., 4.5 for size 45)
  const scale = size / 10;
  
  // Sheet dimensions at native 1x resolution
  const sheetWidth = 1340;
  const sheetHeight = 651;

  return (
    <div 
      className={cn("shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: 'url(/images/spritesheet.png)',
        // Lock background size and position to exact pixel values at the current scale
        backgroundPosition: `-${finalX * scale}px -${finalY * scale}px`,
        backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  );
}
