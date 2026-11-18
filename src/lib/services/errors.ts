// Errori dei service (src/lib/services): indipendenti da HTTP e da Next. Le
// route mobile li traducono in {error,message} (withMobileAuth); le server action
// del web li traducono in ActionResult. ForbiddenError (403) è in task-archive.ts.

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Risorsa non trovata") {
    super(message);
    this.name = "NotFoundError";
  }
}

// Dati non validi (400 invalid_request).
export class ValidationError extends Error {
  readonly status = 400;
  constructor(message = "Dati non validi") {
    super(message);
    this.name = "ValidationError";
  }
}

// Troppe richieste (429 rate_limited), per esempio il limite giornaliero di rivelazioni delle licenze.
export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message = "Troppe richieste: riprova più tardi") {
    super(message);
    this.name = "RateLimitError";
  }
}

// Richiesta valida ma in conflitto con lo stato dei dati (409 conflict), per
// esempio un partecipante assente nelle date dell'evento.
export class ConflictError extends Error {
  readonly status = 409;
  constructor(message = "Operazione in conflitto con i dati esistenti") {
    super(message);
    this.name = "ConflictError";
  }
}
