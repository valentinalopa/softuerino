import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Colibrì DS · Button: primary violet con ombra accent, controlli da 32/40/48px,
// raggio 10px, focus ring 4px Accent 200, transizioni 120ms.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium leading-none whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-[120ms] ease-ds outline-none select-none focus-visible:ring-4 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-neutral-400 disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-accent hover:bg-primary-hover hover:shadow-md active:bg-primary-active",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-sky-600 active:bg-sky-700",
        soft:
          "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft-hover aria-expanded:bg-primary-soft-hover",
        outline:
          "border-violet-200 bg-transparent text-primary hover:bg-primary-soft aria-expanded:bg-primary-soft dark:border-violet-800 dark:text-violet-300",
        ghost:
          "text-card-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-red-600 active:bg-red-700 focus-visible:ring-destructive/25",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-[18px] text-base has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*='size-'])]:size-[18px]",
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3.5 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-xs":
          "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
      shape: {
        rounded: "",
        pill: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "rounded",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  shape = "rounded",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
