import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { TONE_SOFT } from "@/lib/tones"

// Colibrì DS · Badge: etichetta di stato non interattiva, sempre su fondo tenue.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 text-xs leading-none font-medium whitespace-nowrap transition-colors focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3.25!",
  {
    variants: {
      variant: {
        // Un variant per ogni tono del DS (vedi src/lib/tones.ts).
        default: `${TONE_SOFT.accent} [a]:hover:bg-primary-soft-hover`,
        accent: TONE_SOFT.accent,
        neutral: TONE_SOFT.neutral,
        aqua: TONE_SOFT.aqua,
        teal: TONE_SOFT.teal,
        success: TONE_SOFT.success,
        warning: TONE_SOFT.warning,
        danger: TONE_SOFT.danger,
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
