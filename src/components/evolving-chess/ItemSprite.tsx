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
 * HIGH-PRECISION BACKGROUND SPRITE RENDERING
 * Uses absolute pixel offsets and background-size to eliminate coordinate drift.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: The items are natively 10x12.
  const scale = size / 10;
  
  // The original spritesheet is 1340px wide. 
  // We scale the background-size proportionally to maintain pixel alignment.
  const scaledSheetWidth = 1340 * scale;

  return (
    <div 
      className={cn("shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintains 10:12 native aspect ratio
        backgroundImage: 'url(/images/spritesheet.png)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${scaledSheetWidth}px auto`,
        // Precisely shift the background based on scaled metadata coordinates
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
