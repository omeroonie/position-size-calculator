"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { currencyPairs } from "@/lib/currency-pairs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CurrencyPairAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

export function CurrencyPairAutocomplete({ value, onChange }: CurrencyPairAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.toUpperCase().replace(/\s+/g, "").trim();
  const hasExactPairMatch = currencyPairs.some((pair) => pair === normalizedQuery);

  const commitCustomValue = () => {
    if (!normalizedQuery) {
      return;
    }

    onChange(normalizedQuery);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between text-left font-normal">
          {value || "Select currency pair"}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Search or type symbol..."
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === "Enter" && normalizedQuery && !hasExactPairMatch) {
                event.preventDefault();
                commitCustomValue();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>No currency pair found.</CommandEmpty>
            <CommandGroup>
              {normalizedQuery && !hasExactPairMatch ? (
                <CommandItem
                  value={normalizedQuery}
                  onSelect={() => {
                    commitCustomValue();
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === normalizedQuery ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  Use custom symbol "{normalizedQuery}"
                </CommandItem>
              ) : null}
              {currencyPairs.map((pair) => (
                <CommandItem
                  key={pair}
                  value={pair}
                  onSelect={(currentValue) => {
                    onChange(currentValue.toUpperCase());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === pair ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  {pair}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
