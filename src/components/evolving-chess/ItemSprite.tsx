'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { InventoryItemType } from '@/types';

interface ItemSpriteProps {
  type?: InventoryItemType;
  size?: number;
  className?: string;
}

export function ItemSprite({ type, size = 16, className }: ItemSpriteProps) {
  if (!type) return null;

  const renderIcon = () => {
    switch (type) {
      case 'mirror_shield':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="1" width="6" height="10" fill="#EAB308" />
            <rect x="1" y="2" width="8" height="8" fill="#EAB308" />
            <rect x="3" y="3" width="4" height="6" fill="#94A3B8" />
            <rect x="2" y="4" width="6" height="4" fill="#94A3B8" />
            <rect x="4" y="4" width="2" height="1" fill="#E2E8F0" />
            <rect x="3" y="5" width="1" height="1" fill="#E2E8F0" />
          </svg>
        );
      case 'swift_cloak':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="3" y="1" width="4" height="4" fill="#EF4444" />
            <rect x="2" y="2" width="6" height="3" fill="#EF4444" />
            <rect x="1" y="5" width="8" height="6" fill="#EF4444" />
            <rect x="0" y="6" width="10" height="5" fill="#EF4444" />
            <rect x="4" y="5" width="2" height="1" fill="#FDE047" />
            <rect x="4" y="2" width="2" height="2" fill="#7F1D1D" />
          </svg>
        );
      case 'passive_armor':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="3" width="6" height="8" fill="#3B82F6" />
            <rect x="1" y="4" width="8" height="6" fill="#3B82F6" />
            <rect x="1" y="2" width="3" height="3" fill="#1D4ED8" />
            <rect x="6" y="2" width="3" height="3" fill="#1D4ED8" />
            <rect x="3" y="5" width="4" height="1" fill="#60A5FA" />
          </svg>
        );
      case 'cardinal_greaves':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="5" width="3" height="6" fill="#22C55E" />
            <rect x="6" y="5" width="3" height="6" fill="#22C55E" />
            <rect x="0" y="9" width="4" height="2" fill="#166534" />
            <rect x="6" y="9" width="4" height="2" fill="#166534" />
          </svg>
        );
      case 'drift_boots':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="5" width="3" height="6" fill="#0EA5E9" />
            <rect x="6" y="5" width="3" height="6" fill="#0EA5E9" />
            <rect x="1" y="8" width="8" height="1" fill="#BAE6FD" />
            <rect x="0" y="9" width="4" height="2" fill="#075985" />
            <rect x="6" y="9" width="4" height="2" fill="#075985" />
          </svg>
        );
      case 'queens_peace':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="5" width="6" height="5" fill="#94A3B8" />
            <rect x="3" y="6" width="4" height="3" fill="#000" />
            <rect x="3" y="2" width="4" height="4" fill="#94A3B8" />
            <rect x="4" y="3" width="2" height="2" fill="#60A5FA" />
            <rect x="4" y="3" width="1" height="1" fill="#FFF" />
          </svg>
        );
      case 'wind_sword':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="1" width="2" height="8" fill="#7DD3FC" />
            <rect x="3" y="2" width="4" height="6" fill="#7DD3FC" />
            <rect x="2" y="8" width="6" height="2" fill="#1E40AF" />
            <rect x="4" y="10" width="2" height="2" fill="#1E40AF" />
            <rect x="1" y="3" width="1" height="1" fill="#FFF" opacity="0.6" />
            <rect x="8" y="5" width="1" height="1" fill="#FFF" opacity="0.6" />
          </svg>
        );
      case 'middle_way':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#EAB308" />
            <rect x="3" y="3" width="4" height="6" fill="#000" />
            <rect x="4" y="4" width="2" height="4" fill="#FFF" />
            <rect x="4" y="1" width="2" height="2" fill="#64748B" />
          </svg>
        );
      case 'phoenix_down':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="1" width="2" height="10" fill="#F97316" />
            <rect x="3" y="2" width="4" height="8" fill="#F97316" />
            <rect x="2" y="4" width="6" height="5" fill="#EF4444" />
            <rect x="1" y="6" width="8" height="2" fill="#EF4444" />
            <rect x="4" y="4" width="2" height="2" fill="#FDE047" />
          </svg>
        );
      case 'wind_scroll':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#BAE6FD" />
            <rect x="1" y="3" width="8" height="6" fill="#BAE6FD" />
            <rect x="3" y="4" width="4" height="4" fill="#FFF" opacity="0.5" />
            <rect x="4" y="5" width="2" height="2" fill="#0284C7" />
          </svg>
        );
      case 'life_leach':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#C084FC" />
            <rect x="1" y="3" width="8" height="6" fill="#C084FC" />
            <rect x="4" y="4" width="2" height="4" fill="#4C1D95" />
            <rect x="3" y="5" width="4" height="2" fill="#4C1D95" />
          </svg>
        );
      case 'summon_anvil':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#94A3B8" />
            <rect x="1" y="3" width="8" height="6" fill="#94A3B8" />
            <rect x="3" y="5" width="4" height="3" fill="#334155" />
            <rect x="4" y="4" width="2" height="1" fill="#334155" />
          </svg>
        );
      case 'wind_cloak':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="3" y="1" width="4" height="4" fill="#BAE6FD" />
            <rect x="2" y="2" width="6" height="3" fill="#BAE6FD" />
            <rect x="1" y="5" width="8" height="6" fill="#BAE6FD" />
            <rect x="0" y="6" width="10" height="5" fill="#BAE6FD" />
            <rect x="4" y="5" width="2" height="1" fill="#FFF" opacity="0.8" />
            <rect x="4" y="2" width="2" height="2" fill="#0284C7" />
          </svg>
        );
      case 'gnosis':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="0" width="2" height="9" fill="#EAB308" />
            <rect x="3" y="1" width="4" height="7" fill="#EAB308" />
            <rect x="2" y="9" width="6" height="2" fill="#713F12" />
            <rect x="4" y="11" width="2" height="1" fill="#713F12" />
            <rect x="4" y="2" width="2" height="4" fill="#FEF9C3" opacity="0.7" />
          </svg>
        );
      case 'shield_scroll':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#FDE68A" />
            <rect x="1" y="3" width="8" height="6" fill="#FDE68A" />
            <rect x="3" y="4" width="4" height="4" fill="#3B82F6" />
            <rect x="4" y="5" width="2" height="2" fill="#FFF" opacity="0.5" />
          </svg>
        );
      case 'rally_scroll':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#FDE68A" />
            <rect x="1" y="3" width="8" height="6" fill="#FDE68A" />
            <rect x="4" y="4" width="2" height="4" fill="#EAB308" />
            <rect x="3" y="5" width="4" height="2" fill="#EAB308" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-50">
            <rect x="2" y="2" width="6" height="8" fill="#555" />
          </svg>
        );
    }
  };

  return (
    <div 
      className={cn("relative inline-block shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size * 1.2}px`,
      }}
    >
      {renderIcon()}
    </div>
  );
}
