import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg px-3.5 py-1 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground border border-input bg-card text-foreground shadow-xs transition-[border-color,box-shadow] duration-ds ease-ds outline-none placeholder:text-muted-foreground focus-visible:border-input-focus focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
