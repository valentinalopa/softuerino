import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NameEmailFields({
  idPrefix,
  defaultName,
  defaultEmail,
  readOnly = false,
}: {
  idPrefix: string;
  defaultName: string;
  defaultEmail: string;
  // Utenti gestiti da Keycloak: nome ed email si cambiano solo lì.
  readOnly?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={defaultName}
          required
          readOnly={readOnly}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
          readOnly={readOnly}
        />
      </div>
    </>
  );
}
