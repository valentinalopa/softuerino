"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { AnimationItem } from "lottie-web";
import { buttonVariants } from "@/components/ui/button";
import { SegmentedButtonTabs } from "@/components/SegmentedLinkTabs";
import { cn } from "@/lib/utils";
import {
  OPENVPN_CLIENT_PAGE,
  VPN_GUIDES,
  VPN_PLATFORMS,
  VPN_STEP_FRAMES,
  detectVpnPlatform,
  type VpnPlatform,
} from "@/lib/vpn/guide";

const noSubscribe = () => () => {};

// Guida con animazione Lottie: si apre sul dispositivo in uso e il passo
// mostrato dall'animazione è evidenziato nell'elenco (clic su un passo =
// l'animazione riparte da lì).
export function VpnGuide() {
  const detected = useSyncExternalStore(
    noSubscribe,
    () => detectVpnPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null
  );
  const [chosen, setChosen] = useState<VpnPlatform | null>(null);
  const platform = chosen ?? detected ?? "windows";
  const guide = VPN_GUIDES[platform];

  const [step, setStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    let anim: AnimationItem | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    (async () => {
      // Player "light": niente eval, compatibile con la CSP.
      const [{ default: lottie }, data] = await Promise.all([
        import("lottie-web/build/player/lottie_light"),
        fetch(`/lottie/vpn-${platform}.json`).then((r) => r.json()),
      ]);
      if (cancelled || !containerRef.current) return;
      anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: !reduceMotion,
        animationData: data,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      animRef.current = anim;
      setStep(0);
      // Con il movimento ridotto si mostra la fine del passo, ferma.
      if (reduceMotion) anim.goToAndStop(VPN_STEP_FRAMES - 1, true);
      anim.addEventListener("enterFrame", () => {
        const current = Math.min(3, Math.floor((anim?.currentFrame ?? 0) / VPN_STEP_FRAMES));
        setStep((prev) => (prev === current ? prev : current));
      });
    })().catch(() => {
      // Animazione non caricata: la guida testuale basta.
    });

    return () => {
      cancelled = true;
      anim?.destroy();
      animRef.current = null;
    };
  }, [platform]);

  function goToStep(index: number) {
    setStep(index);
    const anim = animRef.current;
    if (!anim) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      anim.goToAndStop(index * VPN_STEP_FRAMES + VPN_STEP_FRAMES - 1, true);
    } else {
      anim.goToAndPlay(index * VPN_STEP_FRAMES, true);
    }
  }

  return (
    <div className="space-y-5">
      <SegmentedButtonTabs
        items={VPN_PLATFORMS.map((key) => ({ key, label: VPN_GUIDES[key].label }))}
        value={platform}
        onChange={setChosen}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
        <div
          ref={containerRef}
          aria-hidden="true"
          className="aspect-[3/2] w-full overflow-hidden rounded-2xl border border-surface-border bg-muted"
        />
        <div className="space-y-4">
          <ol className="space-y-2">
            {guide.steps.map((text, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => goToStep(index)}
                  aria-current={index === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-ds ease-ds",
                    index === step ? "bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      index === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{text}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <a href={guide.app.href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              OpenVPN Connect: {guide.app.label}
            </a>
            <a
              href={OPENVPN_CLIENT_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Altre versioni
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
