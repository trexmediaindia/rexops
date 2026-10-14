import { Button, Callout, Skeleton } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { request } from "../../lib/request";
import type { ClientRecord } from "../../lib/types";
import { FormDialog } from "../ui/form-dialog";

type ClientRole = "CLIENT_OWNER" | "CLIENT_MEMBER";

type ClientPerson = {
  id: string;
  name: string;
  email: string;
  role: ClientRole;
  banned: boolean | null;
  createdAt: string;
};

type AddedClientPerson = ClientPerson & { temporaryPassword: string };

const ROLE_LABEL: Record<ClientRole, string> = {
  CLIENT_OWNER: "Can approve",
  CLIENT_MEMBER: "View and comment",
};

/**
 * Portal logins for one client company. Mirrors the team screen's invite: nothing is emailed,
 * so the temporary password is shown once, here, for the agency to pass on.
 */
export function ClientPeopleDialog({
  client,
  onClose,
}: {
  client: ClientRecord;
  onClose: () => void;
}) {
  const headingId = useId();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<AddedClientPerson | null>(null);
  const [copied, setCopied] = useState(false);
  const queryKey = ["clients", client.id, "people"];

  const people = useQuery({
    queryKey,
    queryFn: () => request<ClientPerson[]>(`/api/clients/${client.id}/people`),
  });

  const addPerson = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<AddedClientPerson>(`/api/clients/${client.id}/people`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (person) => {
      queryClient.invalidateQueries({ queryKey });
      setAdding(false);
      setCopied(false);
      setAdded(person);
    },
  });

  useEffect(() => {
    if (adding) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adding, onClose]);

  const signInUrl = `${window.location.origin}/login`;

  async function copy(person: AddedClientPerson) {
    await navigator.clipboard?.writeText(
      `Sign in at ${signInUrl}\nEmail: ${person.email}\nTemporary password: ${person.temporaryPassword}`,
    );
    setCopied(true);
  }

  if (adding) {
    return (
      <FormDialog
        title={`Add someone from ${client.name}`}
        description="They get their own login to the client portal, where they see only this company's work once you send it to them."
        submitLabel="Create login"
        pendingLabel="Creating login…"
        pending={addPerson.isPending}
        error={addPerson.error ? (addPerson.error as Error).message : null}
        footnote="Nothing is emailed. You will see a temporary password once, to pass on yourself."
        fields={[
          { name: "name", label: "Full name", required: true, placeholder: "Sara Mehta" },
          {
            name: "email",
            label: "Email",
            type: "email",
            required: true,
            placeholder: "sara@imperialliving.com",
            hint: "This is what they sign in with.",
          },
          {
            name: "role",
            label: "What they can do",
            type: "select",
            options: [
              {
                value: "CLIENT_OWNER",
                label: ROLE_LABEL.CLIENT_OWNER,
                hint: "Watch, comment, and approve or send work back for changes.",
              },
              {
                value: "CLIENT_MEMBER",
                label: ROLE_LABEL.CLIENT_MEMBER,
                hint: "Watch and comment, but the final sign-off stays with someone else.",
              },
            ],
          },
        ]}
        onSubmit={(values) => addPerson.mutate(values)}
        onClose={() => {
          addPerson.reset();
          setAdding(false);
        }}
      />
    );
  }

  return (
    <div className="review-dialog form-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close people"
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>People at {client.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {added ? (
          <>
            <small>
              {added.name} can now sign in. Hand these over now: the password is stored only as a
              hash, so this is the last place it exists in the clear.
            </small>
            <div className="handover">
              <KeyRound size={18} />
              <dl>
                <div>
                  <dt>Sign in at</dt>
                  <dd className="rx-mono">{signInUrl}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className="rx-mono">{added.email}</dd>
                </div>
                <div>
                  <dt>Temporary password</dt>
                  <dd className="rx-mono">{added.temporaryPassword}</dd>
                </div>
              </dl>
            </div>
            <footer className="form-dialog__foot">
              <button type="button" className="form-dialog__cancel" onClick={() => copy(added)}>
                {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                {copied ? "Copied" : "Copy all three"}
              </button>
              <button type="button" className="form-dialog__submit" onClick={() => setAdded(null)}>
                Done
              </button>
            </footer>
          </>
        ) : (
          <>
            <small>
              Each person here signs in to the client portal and sees only {client.name}'s work.
            </small>
            {people.isPending ? (
              <Skeleton lines={3} label="Loading people" />
            ) : people.isError ? (
              <Callout tone="danger" title="People did not load">
                {(people.error as Error).message}
              </Callout>
            ) : people.data.length ? (
              <ul className="client-people">
                {people.data.map((person) => (
                  <li key={person.id}>
                    <span>
                      <strong>{person.name}</strong>
                      <span className="rx-mono">{person.email}</span>
                    </span>
                    <em>{person.banned ? "Suspended" : ROLE_LABEL[person.role]}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="client-people__empty">
                Nobody from {client.name} can sign in yet. Add the person who approves work first.
              </p>
            )}
            <footer className="form-dialog__foot">
              <button type="button" className="form-dialog__cancel" onClick={onClose}>
                Close
              </button>
              <Button
                onClick={() => {
                  addPerson.reset();
                  setAdding(true);
                }}
              >
                <UserPlus size={15} /> Add a person
              </Button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
