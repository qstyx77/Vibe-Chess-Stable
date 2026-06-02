
'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import placeholderImages from '@/app/lib/placeholder-images.json';

interface ItemSpriteProps {
  index: number;
  size?: number;
  className?: string;
}

/**
 * Renders an item from the 16x12 sprite sheet using a clipped Next.js Image component.
 * This ensures pixel-perfect alignment and follows optimization guidelines.
 */
export function ItemSprite({ index, size = 32, className }: ItemSpriteProps) {
  const cols = 16;
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  const spriteSheetUrl = placeholderImages.itemSpriteSheet.url;

  return (
    <div 
      className={cn("relative overflow-hidden shrink-0 inline-block", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      aria-hidden="true"
    >
      <div 
        className="absolute"
        style={{
          width: `${size * 16}px`,
          height: `${size * 12}px`,
          left: `-${col * size}px`,
          top: `-${row * size}px`,
        }}
      >
        <Image
          src={spriteSheetUrl}
          alt=""
          fill
          unoptimized
          className="object-contain"
          style={{ imageRendering: 'pixelated' }}
          data-ai-hint="8-bit items sprite sheet"
        />
      </div>
    </div>
  );
}
