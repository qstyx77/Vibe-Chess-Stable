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
 * REFINED SPRITE RENDERING
 * Uses object-fit: none and object-position to create a physical clipping mask
 * centered on the source pixels of spritesheet.png.
 */
export function ItemSprite({ x = 0, y = 0, size = 10, className }: ItemSpriteProps) {
  // Scaling factor for the UI display
  const scale = size / 10;

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
          width: '1340px', // Native sheet width
          height: 'auto',
          imageRendering: 'pixelated',
          objectFit: 'none',
          // Point precisely to the top-left of the 10x12 sprite
          objectPosition: `-${x}px -${y}px`,
          left: 0,
          top: 0,
          // Use CSS scale to resize the clipped viewport to the desired UI size
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}
