import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/team", label: "Team" },
  { href: "/richieste", label: "Ferie & permessi" },
  { href: "/calendario", label: "Calendario" },
];

export function Nav() {
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
        <span className="text-lg font-semibold">Softuerino</span>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-600 hover:text-black hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
