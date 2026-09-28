import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-lg px-3.5 py-3 text-base leading-6 border border-input bg-card text-foreground shadow-xs transition-[border-color,box-shadow] duration-ds ease-ds outline-none placeholder:text-muted-foreground focus-visible:border-input-focus focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
