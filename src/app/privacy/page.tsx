import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Informativa privacy" };

// Pagina pubblica (vedi PUBLIC_PATHS in src/proxy.ts): si legge anche senza
// accedere. Il testo è quello dell'informativa approvata (art. 13 GDPR):
// modificarlo solo insieme al documento firmato dai lavoratori.
const RETENTION: [string, string][] = [
  [
    "Account, organigramma, presenze, assenze (malattia compresa), ferie, permessi, saldi, recuperi, ore lavorate",
    "Per tutta la durata del rapporto e 10 anni dalla sua cessazione: è il termine di prescrizione ordinaria (art. 2946 c.c.), che copre anche quelli più brevi di 5 anni per crediti retributivi e contributi",
  ],
  [
    "Ore e attività per cliente usate per la fatturazione",
    "10 anni dalla registrazione (art. 2220 c.c., scritture e documenti contabili)",
  ],
  [
    "Eventi di calendario e richieste",
    "Fino a 10 anni dalla cessazione del rapporto, se legati al rapporto",
  ],
  [
    "Task completati",
    "1 anno dal completamento (cancellazione automatica). Dopo 30 giorni passano in un archivio visibile solo ai responsabili di reparto, ai project manager e agli amministratori",
  ],
  [
    "Registri di sicurezza (visualizzazioni \"come utente\", accesso a chiavi di licenza e profili VPN)",
    "Fino a 10 anni dalla cessazione del rapporto",
  ],
  ["Sessioni di accesso", "Al massimo 30 giorni (3 giorni di inattività)"],
  ["Richieste di nuovo account non approvate", "12 mesi"],
  ["Log tecnici dei server", "Al massimo 12 mesi"],
  ["Copie di backup", "30 giorni a rotazione"],
];

const PURPOSES: [string, string][] = [
  [
    "Gestione del rapporto di lavoro: presenze, assenze, ferie, permessi, organizzazione dei turni e dello smart working, elaborazione delle paghe",
    "Esecuzione del contratto (art. 6.1.b GDPR); obblighi di legge e contratto collettivo (art. 6.1.c); per la malattia art. 9.2.b GDPR e art. 88 GDPR",
  ],
  [
    "Registrazione delle ore per cliente, pianificazione e rendicontazione delle attività, fatturazione ai clienti",
    "Esecuzione del contratto (6.1.b) e legittimo interesse organizzativo (6.1.f); obblighi contabili (6.1.c)",
  ],
  [
    "Comunicazioni di servizio via email (esiti delle richieste, inviti, task, promemoria delle ore non registrate)",
    "Esecuzione del contratto (6.1.b) e legittimo interesse organizzativo (6.1.f)",
  ],
  [
    "Sicurezza dei sistemi e degli accessi, assistenza tecnica",
    "Legittimo interesse (6.1.f) e obblighi di sicurezza (art. 32 GDPR)",
  ],
  [
    "Accertamento, esercizio o difesa di un diritto in sede giudiziaria",
    "Legittimo interesse (6.1.f); art. 9.2.f GDPR",
  ],
];

function Table({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 font-medium">{head[0]}</th>
            <th className="px-3 py-2 font-medium">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t align-top">
              <td className="px-3 py-2">{a}</td>
              <td className="px-3 py-2">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
      <h1 className="text-2xl font-semibold">
        Informativa sul trattamento dei dati personali dei dipendenti e collaboratori – Softuerino
      </h1>
      <p className="text-muted-foreground">
        (art. 13 Regolamento UE 2016/679 &quot;GDPR&quot;, D.Lgs. 196/2003 e s.m.i., art. 4, comma 3, L. 300/1970)
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        Colibrì Vision S.r.l.s., sede legale in Via Giovanni Stano 20, 73100 Lecce, sede operativa in Via Faà di
        Bruno 2, 10153 Torino, P.IVA 05266420750, in persona del legale rappresentante pro tempore, Giacomo
        Imbriani.
      </p>
      <p>
        Contatto per la privacy: giacomoimbriani@colibrivision.it, oppure per posta a una delle sedi indicate.
      </p>
      <p>
        Il Titolare non ha nominato un Responsabile della protezione dei dati (DPO), perché non è obbligatorio per
        la sua attività.
      </p>

      <h2>2. Cos&apos;è Softuerino</h2>
      <p>
        Softuerino è il gestionale interno del team (https://time.colibrivision.it), accessibile con l&apos;account
        aziendale (SSO). Serve per organizzare il lavoro: presenze in ufficio o in smart working,
        ferie/permessi/assenze, registrazione delle ore lavorate per cliente, task, calendario ed eventi, licenze
        e strumenti aziendali.
      </p>

      <h2>3. Dati trattati</h2>
      <ul>
        <li>
          <strong>Dati identificativi e di account</strong>: nome, cognome, email aziendale, identificativo
          dell&apos;account aziendale, ruolo nell&apos;applicazione, reparto e responsabile (organigramma ricavato
          dall&apos;account aziendale), tipo di rapporto, preferenze di notifica.
        </li>
        <li>
          <strong>Presenze</strong>: pianificazione giornaliera per fascia (ufficio / smart working).
        </li>
        <li>
          <strong>Assenze</strong>: ferie, permessi, recuperi, chiusure aziendali, <strong>malattia</strong> e{" "}
          <strong>permessi 104</strong> (solo come tipo di assenza e periodo), saldi e rettifiche, note.{" "}
          <strong>Non inserire diagnosi né altre informazioni sanitarie nelle note</strong>: l&apos;azienda non ne
          ha bisogno e non le deve conoscere.
        </li>
        <li>
          <strong>Attività lavorativa</strong>: ore registrate per cliente con descrizione, task assegnati, eventi
          di calendario (con eventuale luogo) e partecipanti.
        </li>
        <li>
          <strong>Dati tecnici di sicurezza</strong>: sessione di accesso (data di ultima attività, metodo di
          accesso), registro di chi visualizza o copia chiavi di licenza e scarica profili VPN, registro delle
          visualizzazioni &quot;come utente&quot; fatte dagli amministratori per assistenza; log tecnici dei server
          (che possono contenere indirizzo IP e data/ora delle richieste).
        </li>
      </ul>
      <p>
        Softuerino <strong>non</strong> rileva posizione geografica, non registra schermo, tastiera, navigazione o
        attività del dispositivo, e non usa cookie di profilazione o di statistica: usa un solo cookie tecnico di
        sessione, necessario per restare collegati.
      </p>

      <h2>4. Finalità e basi giuridiche</h2>
      <Table head={["Finalità", "Base giuridica"]} rows={PURPOSES} />
      <p>Il conferimento dei dati è necessario per la gestione del rapporto di lavoro.</p>

      <h2>5. Controlli a distanza (art. 4 L. 300/1970)</h2>
      <p>
        Softuerino è uno strumento utilizzato per rendere la prestazione lavorativa e per registrare presenze e
        assenze (art. 4, comma 2). Non è usato per controllare a distanza l&apos;attività dei lavoratori.{" "}
        <strong>
          Ai sensi dell&apos;art. 4, comma 3, i dati raccolti possono essere utilizzati a tutti i fini connessi al
          rapporto di lavoro
        </strong>
        , compresi quelli disciplinari, perché ai lavoratori viene data questa informativa sulle modalità d&apos;uso
        degli strumenti e sui controlli, nel rispetto del Codice privacy.
      </p>

      <h2>6. Chi può vedere i dati</h2>
      <ul>
        <li>
          <strong>L&apos;interessato</strong> vede i propri dati.
        </li>
        <li>
          <strong>I responsabili di reparto</strong> vedono i dati del proprio reparto secondo i permessi
          configurati (presenze, richieste, ore). Malattia e permessi 104 vengono mostrati solo come &quot;assenza&quot;.
        </li>
        <li>
          <strong>Gli amministratori dell&apos;applicazione</strong> (personale autorizzato di amministrazione e IT)
          vedono tutti i dati, malattia compresa, per la gestione del personale e l&apos;assistenza tecnica. Ogni
          visualizzazione &quot;come utente&quot; viene registrata.
        </li>
        <li>
          Tutti i soggetti autorizzati sono vincolati alla riservatezza (art. 29 GDPR, art. 2-quaterdecies del
          Codice).
        </li>
      </ul>

      <h2>7. Destinatari esterni</h2>
      <ul>
        <li>
          <strong>Studio Gargiulo Calcagnile</strong> (consulente del lavoro / paghe): riceve i dati necessari agli
          adempimenti retributivi e contributivi, per esempio il riepilogo mensile di presenze e assenze. Opera
          come responsabile del trattamento (art. 28 GDPR).
        </li>
        <li>
          <strong>Cloudflare, Inc.</strong>: protegge e instrada l&apos;accesso via internet al sito. È
          responsabile del trattamento e potrebbe trattare dati negli Stati Uniti sulla base del Data Privacy
          Framework UE-USA e delle clausole contrattuali standard.
        </li>
        <li>
          Autorità pubbliche, enti previdenziali e assicurativi (es. INPS, INAIL) nei casi previsti dalla legge.
        </li>
      </ul>
      <p>
        I server di Softuerino, compreso il server di posta che invia le email di servizio, sono gestiti
        internamente dal Titolare e si trovano a Lecce, in Italia. I dati non vengono diffusi.
      </p>

      <h2>8. Tempi di conservazione</h2>
      <Table head={["Dati", "Conservazione"]} rows={RETENTION} />
      <p>
        Allo scadere dei termini i dati vengono cancellati o resi anonimi. Restano conservati più a lungo solo se
        serve per un contenzioso in corso o per una richiesta delle autorità.
      </p>

      <h2>9. Sicurezza</h2>
      <p>
        Accesso solo con account aziendale e autenticazione centralizzata; connessioni cifrate (HTTPS); accesso via
        internet solo tramite SSO; accesso d&apos;emergenza con password solo dalla rete aziendale; dati e copie
        di backup conservati su archiviazione cifrata; segreti (password e chiavi) cifrati anche all&apos;interno
        del database; ruoli e permessi distinti; backup giornalieri.
      </p>

      <h2>10. Diritti dell&apos;interessato</h2>
      <p>
        Puoi chiedere in qualsiasi momento, scrivendo a giacomoimbriani@colibrivision.it o per posta a una delle
        sedi del Titolare:
      </p>
      <ul>
        <li>accesso ai tuoi dati e copia (art. 15);</li>
        <li>rettifica (art. 16);</li>
        <li>cancellazione, nei limiti degli obblighi di conservazione (art. 17);</li>
        <li>limitazione (art. 18);</li>
        <li>portabilità (art. 20);</li>
        <li>opposizione ai trattamenti basati sul legittimo interesse (art. 21).</li>
      </ul>
      <p>
        Puoi disattivare il promemoria delle ore chiedendolo all&apos;amministrazione. Hai il diritto di presentare
        reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).
      </p>

      <h2>11. Aggiornamenti</h2>
      <p>
        Questa informativa può essere aggiornata. La versione in vigore è consultabile in Softuerino, alla pagina
        &quot;Privacy&quot;. Ultimo aggiornamento: 3 novembre 2026.
      </p>

      <p className="mt-6">
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          Torna a Softuerino
        </Link>
      </p>
    </main>
  );
}
