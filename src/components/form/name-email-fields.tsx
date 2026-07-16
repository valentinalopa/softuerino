import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NameEmailFields({
  idPrefix,
  defaultName,
  defaultEmail,
}: {
  idPrefix: string;
  defaultName: string;
  defaultEmail: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          defaultValue={defaultEmail}
          required
        />
      </div>
    </>
  );
}
