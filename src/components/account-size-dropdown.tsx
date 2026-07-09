"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accountSizeOptions } from "@/lib/account-size-options";
import { cn } from "@/lib/utils";

interface AccountSizeDropdownProps {
  value: number;
  onChange: (value: number) => void;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function AccountSizeDropdown({ value, onChange }: AccountSizeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.replace(/[^0-9.]/g, "").trim();
  const customValue = Number(normalizedQuery);
  const hasValidCustomValue = Number.isFinite(customValue) && customValue > 0;
  const hasExactOptionMatch = accountSizeOptions.some((option) => option === customValue);

  const commitCustomValue = () => {
    if (!hasValidCustomValue) {
      return;
    }

    onChange(customValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between text-left font-normal">
          {value > 0 ? formatNumber(value) : "Select account size"}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Search or type amount..."
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === "Enter" && hasValidCustomValue && !hasExactOptionMatch) {
                event.preventDefault();
                commitCustomValue();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>No amount found.</CommandEmpty>
            <CommandGroup>
              {hasValidCustomValue && !hasExactOptionMatch ? (
                <CommandItem
                  value={normalizedQuery}
                  onSelect={() => {
                    commitCustomValue();
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === customValue ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  Use custom amount {formatNumber(customValue)}
                </CommandItem>
              ) : null}
              {accountSizeOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={String(option)}
                  onSelect={(selectedValue) => {
                    const nextValue = Number(selectedValue);
                    if (Number.isFinite(nextValue)) {
                      onChange(nextValue);
                    }
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  {formatNumber(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
