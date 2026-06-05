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
 * ROBUST BACKGROUND SPRITE RENDERING
 * Uses CSS background-position and background-size for reliable cross-browser sprite handling.
 * Background-size is calculated based on the target enlargement 'scale'.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Magnification factor
  const scale = size / 10;
  
  // Sheet is 1340px wide at native scale.
  const scaledSheetWidth = 1340 * scale;

  return (
    <div 
      className={cn("shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintain 10:12 aspect ratio
        backgroundImage: 'url(/images/spritesheet.png)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${scaledSheetWidth}px auto`,
        // Position shifted to the negative of scaled coordinates
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
