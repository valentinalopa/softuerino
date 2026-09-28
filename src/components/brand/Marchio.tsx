import { cn } from "@/lib/utils";

// Marchio Colibrì (DS: assets/marchio.svg, artwork 439.15 × 373.046).
// Le sfaccettature nere usano currentColor, così il marchio resta leggibile
// in tema scuro; teal e sky sono i colori fissi del logo.
const TEAL = "#2E98A5";
const SKY = "#79B3CF";
const INK = "currentColor";

const FACETS: { x: number; y: number; fill: string; d: string }[] = [
  { x: 355.629, y: 123.907, fill: INK, d: "M83.521 22.052 14.667 17.061 0 15.889 17.417 0z" },
  { x: 306.241, y: 92.434, fill: SKY, d: "M35.688 0 66.804 31.422.038 8.25c-.051 0-.051-.102 0-.102z" },
  { x: 306.229, y: 100.684, fill: TEAL, d: "M66.817 23.223 49.4 39.112 0 .051.051 0z" },
  { x: 319.215, y: 139.797, fill: TEAL, d: "M51.08 1.171 0 48.127 36.413 0z" },
  { x: 293.853, y: 139.135, fill: INK, d: "M61.775.662 25.362 48.789 0 82.299 17.825 0z" },
  { x: 276.996, y: 100.735, fill: TEAL, d: "M78.632 39.062 34.682 38.399h-.51L0 37.89 29.233 0z" },
  { x: 206.97, y: 139.135, fill: TEAL, d: "M104.707 0 86.883 82.299 0 86.832 104.198 0z" },
  { x: 87.545, y: 138.625, fill: TEAL, d: "M223.624.509 119.425 87.341 0 0h189.451z" },
  { x: 189.146, y: 221.434, fill: TEAL, d: "M104.707 0 24.955 71.553 0 93.911l1.222-12.885 6.774-71.553 9.829-4.94z" },
  { x: 214.1, y: 221.434, fill: INK, d: "M79.753 0 35.904 69.516 0 71.553z" },
  { x: 151.306, y: 65.9, fill: TEAL, d: "M60.655 0 124.264 72.725 0 21.593z" },
  { x: 0, y: 25.26, fill: SKY, d: "M275.57 113.365H87.545L0 0l151.306 62.234z" },
  { x: 120.546, y: 0, fill: TEAL, d: "M91.415 65.9 30.76 87.494 0 0z" },
  { x: 138.626, y: 230.906, fill: INK, d: "M58.516 0 51.743 71.553 50.52 84.438 0 129.56l19.862-45.275.917-2.037z" },
  { x: 139.135, y: 230.906, fill: TEAL, d: "M58.007 0 20.269 82.248l-.916 2.037L0 92.026z" },
  { x: 117.847, y: 315.192, fill: TEAL, d: "M40.64 0 20.779 45.275 0 57.854 21.288 7.741z" },
];

export function Marchio({
  className,
  title = "Colibrì",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 439.15 373.046"
      role="img"
      aria-label={title}
      className={cn("h-7 w-auto shrink-0 text-foreground", className)}
    >
      {FACETS.map((facet, index) => (
        <path
          key={index}
          transform={`translate(${facet.x} ${facet.y})`}
          fill={facet.fill}
          d={facet.d}
        />
      ))}
    </svg>
  );
}
