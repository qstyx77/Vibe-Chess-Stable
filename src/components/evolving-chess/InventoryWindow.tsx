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
  attunementSlots: number;
  usedSlots: number;
}

export function InventoryWindow({
  isOpen,
  onClose,
  inventory,
  selectedItemType,
  onSelectItem,
  usedSlots
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

  return (
    <div 
      className="fixed z-[100] select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <Card className="w-72 border-2 border-primary/50 shadow-2xl bg-black backdrop-blur-none">
        <CardHeader 
          className="p-2 border-b cursor-move bg-[#1a1a1a]"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-primary">
              <Package className="h-4 w-4" />
              <CardTitle className="text-xs font-pixel uppercase">Loot Bag</CardTitle>
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
                  <p className="text-[8px] font-pixel text-center uppercase">Bag is empty</p>
                </div>
              ) : (
                inventory.map((item, idx) => {
                  const meta = ITEM_METADATA[item.type];
                  const isSelected = selectedItemType === item.type;
                  return (
                    <button
                      key={`${item.type}-${idx}`}
                      className={cn(
                        "aspect-[10/12] flex flex-col items-center justify-center border-2 transition-all relative overflow-hidden rounded-none h-14",
                        isSelected 
                          ? "border-accent bg-accent/20 scale-95" 
                          : "border-border hover:border-primary/50"
                      )}
                      style={{ background: 'black' }}
                      onClick={() => onSelectItem(isSelected ? null : item.type)}
                      title={meta.name}
                    >
                      <ItemSprite x={meta.x} y={meta.y} size={40} />
                      {item.count > 1 && (
                        <span className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[8px] px-1 font-bold z-10">
                          x{item.count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
          
          {selectedItemType && (
            <div className="mt-2 p-2 bg-[#111] border border-accent/30 rounded-none animate-in fade-in slide-in-from-bottom-1">
              <p className="text-[10px] font-bold text-accent uppercase leading-none mb-1">
                {ITEM_METADATA[selectedItemType].name}
              </p>
              <p className="text-[9px] text-muted-foreground italic leading-tight">
                {ITEM_METADATA[selectedItemType].description}
              </p>
              <p className="text-[8px] font-pixel text-primary mt-1 animate-pulse uppercase">
                Select a piece to equip
              </p>
            </div>
          )}
          {!selectedItemType && usedSlots > 0 && (
             <p className="text-[8px] text-muted-foreground mt-2 text-center italic">
                Select an equipped piece to unequip it.
             </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
