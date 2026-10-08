import type { FormEvent } from "react";

// Con <form action={funzione}> React 19 riporta i campi ai valori iniziali
// dopo l'invio, anche quando il salvataggio riesce o il server risponde con un
// errore: la schermata sembra tornare indietro finché non si ricarica la
// pagina. Con onSubmit={submitKeepingValues(...)} i campi restano come li ha
// lasciati l'utente; svuotarli, dove serve, lo decide il form.
export function submitKeepingValues(handler: (formData: FormData, form: HTMLFormElement) => unknown) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = event.currentTarget;
    void handler(new FormData(form, submitter), form);
  };
}
