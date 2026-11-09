// Guardia dei test: usano deleteMany, quindi devono girare SOLO su un DB di prova
// in /tmp. Importare PER PRIMO (prima di prisma). Se DATABASE_URL non inizia con
// "file:/tmp/" si ferma subito, prima di qualunque cancellazione.
const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:/tmp/") || url.includes("..")) {
  throw new Error(
    "Test rifiutati: DATABASE_URL deve iniziare con file:/tmp/ (DB di prova). " +
      "Mai eseguire i test sul database di produzione."
  );
}
