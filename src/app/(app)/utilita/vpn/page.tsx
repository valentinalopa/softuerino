import { prisma } from "@/lib/prisma";
import { byName } from "@/lib/utils";
import { requireUser } from "@/lib/auth/session";
import { ssoAccountUrl } from "@/lib/auth/oidc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { VpnSectionDialog } from "@/components/utilita/vpn/VpnSectionDialog";
import { DeleteVpnSectionButton } from "@/components/utilita/vpn/DeleteVpnSectionButton";
import { VpnDownloadActions } from "@/components/utilita/vpn/VpnDownloadActions";
import { VpnGuide } from "@/components/utilita/vpn/VpnGuide";
import { CertificateCard } from "@/components/utilita/vpn/CertificateCard";
import { SsoPanel } from "@/components/utilita/vpn/SsoPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Security" };

const TABS = ["vpn", "sso", "cert"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = { vpn: "VPN", sso: "SSO", cert: "Certificato Colibrì" };

// Utilità → Security: per tutti, in tre tab (?tab=vpn|sso|cert, default vpn).
// VPN: le sezioni (una per VPN, es. una sede) le gestiscono i super admin; sotto,
// la guida per collegarsi con OpenVPN Connect.
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.find((t) => t === tabParam) ?? "vpn";
  const canManage = user.role === "super_admin";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Security</h1>
          <p className="text-sm text-muted-foreground">VPN, account SSO e certificato aziendale.</p>
        </div>
        {tab === "vpn" && canManage && <VpnSectionDialog />}
      </div>

      <SegmentedLinkTabs
        items={TABS.map((t) => ({
          key: t,
          label: TAB_LABELS[t],
          href: t === "vpn" ? "/utilita/vpn" : `/utilita/vpn?tab=${t}`,
          active: tab === t,
        }))}
      />

      {tab === "vpn" && <VpnTab canManage={canManage} />}
      {tab === "sso" && <SsoPanel accountUrl={ssoAccountUrl()} showEmergencyNote={canManage} />}
      {tab === "cert" && <CertificateCard />}
    </div>
  );
}

async function VpnTab({ canManage }: { canManage: boolean }) {
  // Il contenuto cifrato del file non serve alla pagina: resta nel DB.
  const sections = (await prisma.vpnSection.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      notes: true,
      configFileName: true,
      // Registro dei download: mostrato solo ai super admin.
      _count: { select: { downloads: true } },
      downloads: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, createdAt: true, user: { select: { name: true } } },
      },
    },
  })).sort(byName);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Per raggiungere i servizi aziendali da fuori ufficio: scarica la configurazione della VPN
        che ti serve e segui la guida per il tuo dispositivo. Accedi con utente e password del tuo
        account aziendale.
      </p>

      {sections.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Nessuna VPN configurata{canManage ? ": aggiungila con «Nuova VPN»." : "."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <CardTitle>{section.name}</CardTitle>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <VpnSectionDialog
                      initial={{
                        id: section.id,
                        name: section.name,
                        notes: section.notes,
                        configFileName: section.configFileName,
                      }}
                    />
                    <DeleteVpnSectionButton id={section.id} name={section.name} />
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {section.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{section.notes}</p>}
                <VpnDownloadActions id={section.id} name={section.name} fileName={section.configFileName} />
                {canManage && (
                  <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                    <p>
                      Scaricata {section._count.downloads === 1 ? "1 volta" : `${section._count.downloads} volte`}
                      {section._count.downloads > 0 && " · ultimi download:"}
                    </p>
                    {section.downloads.length > 0 && (
                      <ul className="space-y-0.5">
                        {section.downloads.map((d) => (
                          <li key={d.id}>
                            {d.user.name} ·{" "}
                            {new Intl.DateTimeFormat("it-IT", {
                              dateStyle: "short",
                              timeStyle: "short",
                              timeZone: "Europe/Rome",
                            }).format(d.createdAt)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Margini interni ridotti su mobile: le 4 schede dei dispositivi stanno su una riga. */}
      <Card className="[--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle>Come collegarsi</CardTitle>
        </CardHeader>
        <CardContent>
          <VpnGuide />
        </CardContent>
      </Card>
    </div>
  );
}
