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
 * IDEA 1: CLIPPING MASK APPROACH
 * Uses an <img> tag inside an overflow-hidden container.
 * This avoids sub-pixel rounding errors found in background-image scaling.
 * 
 * SPRITE SPECS:
 * Sprite Width: 10px
 * Sprite Height: 12px
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor: how much bigger we want the 10px sprite to appear
  const scale = size / 10;
  
  // Total spritesheet width is 1340px. 
  // We scale the whole image so that our translations remain absolute.
  const sheetWidth = 1340 * scale;

  return (
    <div 
      className={cn("shrink-0 inline-block overflow-hidden relative", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`, // Maintain 10:12 aspect ratio
        backgroundColor: 'black',
      }}
    >
      <img
        src="/images/spritesheet.png"
        alt="Sprite"
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: `${sheetWidth}px`,
          height: 'auto',
          imageRendering: 'pixelated',
          // IDEA 1: Direct translation of the scaled image
          transform: `translate(-${x * scale}px, -${y * scale}px)`,
          left: 0,
          top: 0,
        }}
      />
    </div>
  );
}
