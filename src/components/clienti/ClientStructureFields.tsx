"use client";

import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";

export type ClientStructureOptions = {
  // Clienti che possono avere voci (quelli che non sono a loro volta voci).
  parents: { id: string; name: string }[];
  people: { id: string; name: string }[];
};

// "Fa parte di" e "Chi può loggare" (solo admin), nei form di nuovo cliente e
// di modifica.
export function ClientStructureFields({
  idPrefix,
  options,
  defaultParentId = "",
  defaultLoggerIds = [],
  // Un cliente che ha già voci non può diventare a sua volta una voce.
  parentLocked = false,
  resetKey,
}: {
  idPrefix: string;
  options: ClientStructureOptions;
  defaultParentId?: string;
  defaultLoggerIds?: string[];
  parentLocked?: boolean;
  resetKey: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-parent`}>Fa parte di</Label>
        <NativeSelect
          key={resetKey}
          id={`${idPrefix}-parent`}
          name="parentId"
          defaultValue={defaultParentId}
          disabled={parentLocked}
          containerClassName="w-full"
          className="w-full"
        >
          <option value="">Nessuno (cliente principale)</option>
          {options.parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {parentLocked
            ? "Ha già delle voci collegate, quindi resta un cliente principale."
            : "Le ore di una voce si sommano al totale del cliente scelto."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Chi può loggare</Label>
        <p className="text-xs text-muted-foreground">
          Nessuna persona selezionata = tutti. Gli admin possono sempre correggere le ore.
        </p>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-input p-3">
          <CheckboxGroupField
            key={resetKey}
            name="loggerIds"
            direction="column"
            defaultSelected={defaultLoggerIds}
            options={options.people.map((person) => ({ id: person.id, label: person.name }))}
          />
        </div>
      </div>
    </>
  );
}
