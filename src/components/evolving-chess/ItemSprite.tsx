
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
      case 'life_leach':
      case 'summon_anvil':
      case 'shield_scroll':
      case 'rally_scroll':
      case 'antidote':
      case 'detonation_scroll':
      case 'swap_scroll':
      case 'ice_scroll':
      case 'resurrection_scroll':
      case 'faith_scroll':
        const scrollColors: Record<string, string> = {
          wind_scroll: '#BAE6FD',
          life_leach: '#C084FC',
          summon_anvil: '#94A3B8',
          shield_scroll: '#FDE68A',
          rally_scroll: '#FDE68A',
          antidote: '#10B981',
          detonation_scroll: '#FCA5A5',
          swap_scroll: '#D946EF',
          ice_scroll: '#93C5FD',
          resurrection_scroll: '#FEF08A',
          faith_scroll: '#F8FAFC'
        };
        const iconColors: Record<string, string> = {
          wind_scroll: '#0284C7',
          life_leach: '#4C1D95',
          summon_anvil: '#334155',
          shield_scroll: '#3B82F6',
          rally_scroll: '#EAB308',
          antidote: '#064E3B',
          detonation_scroll: '#B91C1C',
          swap_scroll: '#701A75',
          ice_scroll: '#1D4ED8',
          resurrection_scroll: '#06B6D4',
          faith_scroll: '#2563EB'
        };
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="8" fill={scrollColors[type] || '#FFF'} />
            <rect x="0" y="1" width="10" height="2" fill="#78350F" />
            <rect x="0" y="9" width="10" height="2" fill="#78350F" />
            <rect x="3" y="4" width="4" height="4" fill={iconColors[type] || '#000'} opacity="0.6" />
            {type === 'resurrection_scroll' && <rect x="4" y="5" width="2" height="2" fill="#FFF" />}
            {type === 'faith_scroll' && <rect x="4" y="4" width="2" height="4" fill="#FFF" />}
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
      case 'poison_dagger':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="1" width="2" height="7" fill="#22C55E" />
            <rect x="3" y="2" width="4" height="5" fill="#15803D" />
            <rect x="2" y="8" width="6" height="1" fill="#334155" />
            <rect x="4" y="9" width="2" height="2" fill="#334155" />
            <rect x="5" y="2" width="1" height="2" fill="#BBF7D0" opacity="0.6" />
          </svg>
        );
      case 'crossbow':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="2" fill="#78350F" />
            <rect x="0" y="3" width="2" height="2" fill="#78350F" />
            <rect x="8" y="3" width="2" height="2" fill="#78350F" />
            <rect x="4" y="1" width="2" height="10" fill="#475569" />
            <rect x="3" y="10" width="4" height="2" fill="#78350F" />
            <rect x="2" y="3" width="6" height="1" fill="#CBD5E1" opacity="0.5" />
          </svg>
        );
      case 'poison_tunic':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#15803D" />
            <rect x="1" y="3" width="8" height="6" fill="#15803D" />
            <rect x="3" y="0" width="4" height="3" fill="#15803D" />
            <rect x="4" y="4" width="2" height="3" fill="#22C55E" />
            <rect x="3" y="5" width="4" height="1" fill="#22C55E" />
          </svg>
        );
      case 'phase_boots':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="5" width="3" height="6" fill="#A855F7" />
            <rect x="6" y="5" width="3" height="6" fill="#A855F7" />
            <rect x="1" y="2" width="2" height="2" fill="#E9D5FF" />
            <rect x="0" y="3" width="2" height="2" fill="#E9D5FF" />
            <rect x="8" y="2" width="2" height="2" fill="#E9D5FF" />
            <rect x="9" y="3" width="1" height="2" fill="#E9D5FF" />
          </svg>
        );
      case 'grimoir':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="1" width="2" height="10" fill="#2E1065" />
            <rect x="3" y="1" width="6" height="10" fill="#4C1D95" />
            <rect x="1.5" y="2" width="1" height="1" fill="#C084FC" opacity="0.5" />
            <rect x="1.5" y="5" width="1" height="1" fill="#C084FC" opacity="0.5" />
            <rect x="1.5" y="8" width="1" height="1" fill="#C084FC" opacity="0.5" />
            <rect x="5" y="4" width="2" height="3" fill="#C084FC" />
            <rect x="8.5" y="1.5" width="0.5" height="9" fill="#FFF" opacity="0.3" />
          </svg>
        );
      case 'soul_link':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="1" width="2" height="2" fill="#94A3B8" />
            <circle cx="5" cy="5" r="3" stroke="#94A3B8" strokeWidth="1" />
            <rect x="3" y="8" width="4" height="2" fill="#EF4444" opacity="0.6" />
          </svg>
        );
      case 'logas':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="1" width="2" height="10" fill="#713F12" />
            <rect x="3" y="1" width="6" height="10" fill="#EAB308" />
            <rect x="1.5" y="3" width="1" height="2" fill="#FEF08A" opacity="0.5" />
            <rect x="1.5" y="7" width="1" height="2" fill="#FEF08A" opacity="0.5" />
            <rect x="5" y="3" width="2" height="5" fill="#FFF" />
            <rect x="4" y="4.5" width="4" height="2" fill="#FFF" />
            <rect x="8.5" y="1.5" width="0.5" height="9" fill="#FFF" opacity="0.3" />
          </svg>
        );
      case 'berserkers_mask':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="0" width="2" height="3" fill="#450a0a" />
            <rect x="7" y="0" width="2" height="3" fill="#450a0a" />
            <rect x="2" y="2" width="6" height="9" fill="#B91C1C" />
            <rect x="1" y="4" width="8" height="5" fill="#B91C1C" />
            <rect x="3" y="5" width="1" height="1" fill="#FDE047" />
            <rect x="6" y="5" width="1" height="1" fill="#FDE047" />
            <rect x="4" y="4" width="2" height="1" fill="#7f1d1d" />
            <rect x="4" y="8" width="2" height="1" fill="#FFF" />
            <rect x="4" y="9" width="1" height="1" fill="#FFF" />
            <rect x="5" y="9" width="1" height="1" fill="#FFF" />
          </svg>
        );
      case 'tortoise_hammer':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="1" width="8" height="5" fill="#525252" />
            <rect x="2" y="2" width="6" height="3" fill="#737373" />
            <rect x="4" y="6" width="2" height="6" fill="#78350F" />
            <rect x="0" y="2" width="1" height="3" fill="#404040" />
            <rect x="9" y="2" width="1" height="3" fill="#404040" />
          </svg>
        );
      case 'leach_blade':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="0" width="2" height="9" fill="#4C1D95" />
            <rect x="3" y="2" width="1" height="5" fill="#7C3AED" />
            <rect x="6" y="2" width="1" height="5" fill="#7C3AED" />
            <rect x="2" y="9" width="6" height="2" fill="#1F2937" />
            <rect x="4" y="11" width="2" height="1" fill="#1F2937" />
            <rect x="5" y="1" width="1" height="7" fill="#A78BFA" opacity="0.6" />
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
