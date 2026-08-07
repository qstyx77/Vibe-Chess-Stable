'use client';

import React, { useState } from 'react';
import type { InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Package, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemSprite } from './ItemSprite';

interface InventoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  selectedItemType: InventoryItemType | null;
  onSelectItem: (type: InventoryItemType | null) => void;
  onUseItem?: (type: InventoryItemType) => void;
  attunementSlots: number;
  usedSlots: number;
}

export function InventoryWindow({
  isOpen,
  onClose,
  inventory,
  selectedItemType,
  onSelectItem,
  onUseItem,
  usedSlots,
  attunementSlots
}: InventoryWindowProps) {
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    }
  };

  return (
    <div 
      className="fixed z-[100] select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <Card className="w-72 border-2 border-primary/50 shadow-2xl bg-black backdrop-blur-none">
        <CardHeader 
          className="p-2 border-b cursor-move bg-[#1a1a1a] touch-none"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-primary">
              <Package className="h-4 w-4" />
              <CardTitle className="text-[0.75rem] font-pixel uppercase">Loot Bag</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 bg-black">
          <ScrollArea className="h-48 pr-2">
            <div className="grid grid-cols-4 gap-2">
              {inventory.length === 0 ? (
                <div className="col-span-4 flex flex-col items-center justify-center py-8 opacity-50">
                  <Sparkles className="h-8 w-8 mb-2" />
                  <p className="text-[0.5rem] font-pixel text-center uppercase">Bag is empty</p>
                </div>
              ) : (
                inventory.map((item, idx) => {
                  const meta = ITEM_METADATA[item.type];
                  if (!meta) return null;
                  
                  const isSelected = selectedItemType === item.type;
                  const isUsable = item.type.startsWith('portal_scroll_');
                  
                  const rarityBorderClasses = {
                      common: "border-slate-600 hover:border-slate-400",
                      uncommon: "border-green-400 hover:border-green-200 shadow-[0_0_8px_rgba(74,222,128,0.4)]",
                      rare: "border-purple-600 hover:border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  }[meta.rarity];

                  return (
                    <button
                      key={`${item.type}-${idx}`}
                      className={cn(
                        "aspect-[10/12] flex flex-col items-center justify-center border-2 transition-all relative overflow-hidden rounded-none h-14",
                        isSelected 
                          ? "border-accent bg-accent/20 scale-95 z-10" 
                          : rarityBorderClasses
                      )}
                      style={{ background: 'black' }}
                      onClick={() => {
                        if (isSelected && isUsable && onUseItem) {
                            onUseItem(item.type);
                        } else {
                            onSelectItem(isSelected ? null : item.type);
                        }
                      }}
                      title={`${meta.name} (${meta.rarity.toUpperCase()})`}
                    >
                      <ItemSprite type={item.type} size={40} />
                      {item.count > 1 && (
                        <span className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[0.5rem] px-1 font-bold z-10">
                          x{item.count}
                        </span>
                      )}
                      {meta.rarity === 'rare' && (
                          <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_10px_rgba(168,85,247,0.4)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
          
          {selectedItemType && ITEM_METADATA[selectedItemType] && (
            <div className="mt-2 p-2 bg-[#111] border border-accent/30 rounded-none animate-in fade-in slide-in-from-bottom-1">
              <div className="flex justify-between items-start mb-1">
                  <p className="text-[0.65rem] font-bold text-accent uppercase leading-none">
                    {ITEM_METADATA[selectedItemType].name}
                  </p>
                  <span className={cn(
                      "text-[0.45rem] px-1 py-0.5 rounded-sm uppercase font-bold",
                      {
                          common: "bg-slate-700 text-slate-300",
                          uncommon: "bg-green-900 text-green-400",
                          rare: "bg-purple-900 text-purple-300"
                      }[ITEM_METADATA[selectedItemType].rarity]
                  )}>
                      {ITEM_METADATA[selectedItemType].rarity}
                  </span>
              </div>
              <p className="text-[0.6rem] text-muted-foreground italic leading-tight">
                {ITEM_METADATA[selectedItemType].description}
              </p>
              {selectedItemType.startsWith('portal_scroll_') ? (
                <p className="text-[0.55rem] font-pixel text-secondary mt-1 animate-pulse uppercase">
                  Select again to warp
                </p>
              ) : (
                <p className="text-[0.55rem] font-pixel text-primary mt-1 animate-pulse uppercase">
                  {ITEM_METADATA[selectedItemType].rarity === 'rare' ? 'Only 1 active allowed' : 'Select a piece to equip'}
                </p>
              )}
            </div>
          )}
          {!selectedItemType && usedSlots > 0 && (
             <p className="text-[0.55rem] text-muted-foreground mt-2 text-center italic uppercase font-pixel">
                Select an equipped piece to unequip it.
             </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
