import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Colibrì DS · Badge: etichetta di stato non interattiva, sempre su fondo tenue.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 text-xs leading-none font-medium whitespace-nowrap transition-colors focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-[13px]!",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary-soft-foreground [a]:hover:bg-primary-soft-hover",
        secondary:
          "bg-muted text-neutral-700 dark:text-neutral-300 [a]:hover:bg-neutral-200",
        aqua: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
        success: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
        warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        destructive:
          "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300 [a]:hover:bg-red-100",
        outline:
          "border-border text-card-foreground [a]:hover:bg-muted",
        ghost:
          "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
