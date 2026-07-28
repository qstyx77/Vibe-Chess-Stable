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
      case 'portal_scroll_10':
      case 'portal_scroll_20':
      case 'portal_scroll_30':
      case 'portal_scroll_40':
      case 'portal_scroll_50':
        const floorNum = parseInt(type.split('_')[2]);
        let portalColor = '#3B82F6'; // Default Blue
        if (floorNum === 10) portalColor = '#22D3EE'; // Cyan
        else if (floorNum === 30) portalColor = '#8B5CF6'; // Purple
        else if (floorNum === 40) portalColor = '#EAB308'; // Amber
        else if (floorNum === 50) portalColor = '#F43F5E'; // Crimson/Red

        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="8" fill={portalColor} />
            <rect x="0" y="1" width="10" height="2" fill="#1e1b4b" />
            <rect x="0" y="9" width="10" height="2" fill="#1e1b4b" />
            <circle cx="5" cy="6" r="3" fill="#FFF" fillOpacity="0.4" />
            <rect x="3" y="4" width="4" height="4" fill="#000" fillOpacity="0.3" />
          </svg>
        );
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
      case 'kings_decree':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="8" fill="#FDE047" />
            <rect x="0" y="1" width="10" height="2" fill="#B45309" />
            <rect x="0" y="9" width="10" height="2" fill="#B45309" />
            <rect x="3" y="4" width="4" height="4" fill="#B45309" opacity="0.8" />
          </svg>
        );
      case 'gravity_stone':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="3" width="6" height="6" fill="#7C3AED" rx="3" />
            <rect x="3" y="4" width="4" height="4" fill="#A78BFA" opacity="0.6" rx="2" />
            <rect x="4.5" y="5.5" width="1" height="1" fill="#FFF" />
          </svg>
        );
      case 'lead_boots':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="6" width="3" height="5" fill="#475569" />
            <rect x="6" y="6" width="3" height="5" fill="#475569" />
            <rect x="0" y="9" width="4" height="2" fill="#1E293B" />
            <rect x="6" y="9" width="4" height="2" fill="#1E293B" />
          </svg>
        );
      case 'blast_shield':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="8" fill="#525252" />
            <rect x="2" y="3" width="6" height="6" fill="#525252" />
            <rect x="4" y="2" width="2" height="8" fill="#171717" />
            <rect x="1" y="5" width="8" height="2" fill="#171717" />
            <rect x="3" y="4" width="1" height="1" fill="#DC2626" />
            <rect x="6" y="4" width="1" height="1" fill="#DC2626" />
            <rect x="3" y="7" width="1" height="1" fill="#DC2626" />
            <rect x="6" y="7" width="1" height="1" fill="#DC2626" />
          </svg>
        );
      case 'monks_robe':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="10" fill="#78350F" />
            <rect x="1" y="4" width="8" height="6" fill="#78350F" />
            <rect x="4" y="2" width="2" height="4" fill="#FDE68A" opacity="0.3" />
            <rect x="3" y="6" width="4" height="1" fill="#92400E" />
          </svg>
        );
      case 'training_weights':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="5" width="8" height="4" fill="#404040" />
            <rect x="2" y="4" width="6" height="6" fill="#404040" />
            <rect x="4" y="2" width="2" height="3" fill="#171717" />
            <rect x="3" y="6" width="4" height="2" fill="#737373" opacity="0.5" />
          </svg>
        );
      case 'ice_tunic':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="2" width="6" height="8" fill="#93C5FD" />
            <rect x="1" y="3" width="8" height="6" fill="#93C5FD" />
            <rect x="3" y="0" width="4" height="3" fill="#93C5FD" />
            <rect x="4" y="4" width="2" height="3" fill="#BAE6FD" />
            <rect x="3" y="5" width="4" height="1" fill="#BAE6FD" />
          </svg>
        );
      case 'ice_sword':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="0" width="2" height="9" fill="#93C5FD" />
            <rect x="3" y="1" width="4" height="7" fill="#93C5FD" />
            <rect x="2" y="9" width="6" height="2" fill="#1E3A8A" />
            <rect x="4" y="11" width="2" height="1" fill="#1E3A8A" />
            <rect x="4" y="2" width="2" height="4" fill="#F0F9FF" opacity="0.7" />
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
      case 'ice_blast':
      case 'soul_harvest':
      case 'earthquake_scroll':
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
          faith_scroll: '#F8FAFC',
          ice_blast: '#BAE6FD',
          soul_harvest: '#4C1D95',
          earthquake_scroll: '#78350F'
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
          faith_scroll: '#2563EB',
          ice_blast: '#2563EB',
          soul_harvest: '#000',
          earthquake_scroll: '#FDE68A'
        };
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="8" fill={scrollColors[type] || '#FFF'} />
            <rect x="0" y="1" width="10" height="2" fill="#78350F" />
            <rect x="0" y="9" width="10" height="2" fill="#78350F" />
            <rect x="3" y="4" width="4" height="4" fill={iconColors[type] || '#000'} opacity="0.6" />
            {type === 'resurrection_scroll' && <rect x="4" y="5" width="2" height="2" fill="#FFF" />}
            {type === 'faith_scroll' && <rect x="4" y="4" width="2" height="4" fill="#FFF" />}
            {type === 'soul_harvest' && <rect x="4" y="4" width="2" height="4" fill="#8B5CF6" />}
            {type === 'earthquake_scroll' && <path d="M3 6L5 4L7 6L5 8L3 6Z" fill="#FFF" opacity="0.8" />}
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
      case 'poison_sword':
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
      case 'shortbow':
        const bowColor = type === 'crossbow' ? '#475569' : '#92400E';
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="2" width="8" height="2" fill="#78350F" />
            <rect x="0" y="3" width="2" height="2" fill="#78350F" />
            <rect x="8" y="3" width="2" height="2" fill="#78350F" />
            <rect x="4" y="1" width="2" height="10" fill={bowColor} />
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
      case 'aura_silence':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <circle cx="5" cy="6" r="4" fill="#1e1b4b" />
            <circle cx="5" cy="6" r="2.5" fill="#312e81" stroke="#4f46e5" strokeWidth="1" />
            <rect x="4" y="5" width="2" height="2" fill="#a5b4fc" opacity="0.5" />
            <rect x="2" y="6" width="6" height="0.5" fill="#FFF" opacity="0.2" />
          </svg>
        );
      case 'grappling_hook':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="4" y="1" width="2" height="8" fill="#475569" />
            <rect x="2" y="0" width="1" height="3" fill="#64748b" />
            <rect x="7" y="0" width="1" height="3" fill="#64748b" />
            <path d="M2 3 Q5 6 8 3" stroke="#94a3b8" strokeWidth="1.5" />
            <rect x="3" y="9" width="4" height="2" fill="#1e293b" />
          </svg>
        );
      case 'battering_ram':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="3" width="8" height="6" fill="#78350F" />
            <rect x="0" y="4" width="10" height="4" fill="#78350F" />
            <rect x="8" y="2" width="2" height="8" fill="#475569" />
            <rect x="7" y="4" width="1" height="4" fill="#171717" opacity="0.4" />
            <rect x="3" y="5" width="2" height="2" fill="#FDE68A" />
          </svg>
        );
      case 'knights_boots':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="6" width="4" height="5" fill="#EAB308" />
            <rect x="5" y="6" width="4" height="5" fill="#EAB308" />
            <rect x="0" y="9" width="5" height="2" fill="#B45309" />
            <rect x="5" y="9" width="5" height="2" fill="#B45309" />
            <rect x="3" y="2" width="2" height="4" fill="#EAB308" />
            <rect x="6" y="2" width="2" height="4" fill="#EAB308" />
          </svg>
        );
      case 'golden_chalice':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="2" y="1" width="6" height="2" fill="#EAB308" />
            <rect x="3" y="3" width="4" height="5" fill="#EAB308" />
            <rect x="4" y="8" width="2" height="2" fill="#EAB308" />
            <rect x="2" y="10" width="6" height="1" fill="#EAB308" />
            <circle cx="5" cy="4" r="1.5" fill="#FFF" opacity="0.5" />
          </svg>
        );
      case 'sclerotia':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <rect x="1" y="4" width="8" height="4" fill="#78350F" />
            <circle cx="5" cy="6" r="3" fill="#10B981" />
            <rect x="4" y="3" width="2" height="1" fill="#FFF" opacity="0.5" />
            <rect x="4" y="9" width="2" height="1" fill="#FFF" opacity="0.5" />
          </svg>
        );
      case 'smoke_bomb':
        return (
          <svg viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <circle cx="5" cy="7" r="4" fill="#525252" />
            <rect x="4" y="1" width="2" height="3" fill="#EAB308" />
            <path d="M2 3 Q0 5 2 7" stroke="#FFF" strokeWidth="0.5" opacity="0.3" />
            <path d="M8 3 Q10 5 8 7" stroke="#FFF" strokeWidth="0.5" opacity="0.3" />
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
