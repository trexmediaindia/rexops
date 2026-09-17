import { Button, Callout, Skeleton } from "@rexops/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Check, Send } from "lucide-react";
import { useState } from "react";
import { Field } from "../components/ui/field";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
};
type Form = { name: string; fields: FormField[] };

/*
 * A public form filled in by someone who has never heard of RexOps and will
 * never sign in. It asked them to "Submit request" against unexplained fields,
 * said nothing while it loaded or failed, and confirmed success with "A
 * structured deliverable will be created from this submission." Every sentence
 * here is now written for the person filling it in.
 */
const TYPE_HINTS: Record<string, string> = {
  DATE: "Pick the date you need this by.",
  NUMBER: "Numbers only.",
  BOOLEAN: "Tick the box for yes, leave it clear for no.",
};

export function IntakePage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [complete, setComplete] = useState(false);
  const form = useQuery({
    queryKey: ["public-intake", slug],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/public/intake/${slug}`);
      if (!response.ok) throw new Error("This request form could not be opened.");
      return response.json() as Promise<Form>;
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/public/intake/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "Something in the form was not accepted.");
      }
      return response.json();
    },
    onSuccess: () => setComplete(true),
  });

  const fields = form.data?.fields ?? [];
  // Named rather than counted: "2 fields missing" makes people hunt for them.
  const missing = fields
    .filter((field) => field.required && field.type !== "BOOLEAN")
    .filter((field) => {
      const value = answers[field.key];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.label);

  return (
    <main className="intake-page">
      <header>
        <span className="wordmark__mark">R</span>
        <span>Request form</span>
      </header>
      <section>
        {complete ? (
          <div className="intake-complete">
            <Check size={28} />
            <span className="rx-eyebrow">Sent</span>
            <h1>Your request is with the team</h1>
            <p>
              They can see everything you filled in. They will turn it into a piece of work and come
              back to you directly if anything needs clearing up. There is nothing else for you to
              do here, and you can close this page.
            </p>
          </div>
        ) : (
          <>
            <span className="rx-eyebrow">New request</span>
            <h1>{form.data?.name ?? "Opening the request form…"}</h1>
            <p>
              Fill this in and it goes straight to the team who will do the work. The more specific
              you are about what you need and when, the less they will have to come back and ask.
            </p>

            {form.isLoading ? <Skeleton lines={4} label="Opening the request form" /> : null}

            {form.isError ? (
              <Callout tone="danger" title="This form could not be opened">
                {(form.error as Error).message} The link may have expired, or the team may have
                turned this form off. Check with whoever sent it to you.
                <div className="rx-callout__action">
                  <Button variant="secondary" onClick={() => form.refetch()}>
                    Try loading it again
                  </Button>
                </div>
              </Callout>
            ) : null}

            {fields.length ? (
              <div className="intake-fields">
                {fields.map((field) =>
                  field.type === "BOOLEAN" ? (
                    <div className="intake-check" key={field.id}>
                      <input
                        id={`intake-${field.id}`}
                        type="checkbox"
                        checked={Boolean(answers[field.key])}
                        onChange={(event) =>
                          setAnswers({ ...answers, [field.key]: event.target.checked })
                        }
                      />
                      <label htmlFor={`intake-${field.id}`}>
                        {field.label}
                        {field.required ? null : (
                          <span className="rx-field__optional">Optional</span>
                        )}
                      </label>
                    </div>
                  ) : (
                    <Field
                      key={field.id}
                      id={`intake-${field.id}`}
                      label={field.label}
                      optional={!field.required}
                      hint={TYPE_HINTS[field.type]}
                    >
                      {(control) => (
                        <input
                          {...control}
                          type={
                            field.type === "DATE"
                              ? "date"
                              : field.type === "NUMBER"
                                ? "number"
                                : "text"
                          }
                          required={field.required}
                          value={answers[field.key] === undefined ? "" : String(answers[field.key])}
                          onChange={(event) =>
                            setAnswers({
                              ...answers,
                              [field.key]:
                                field.type === "NUMBER"
                                  ? Number(event.target.value)
                                  : event.target.value,
                            })
                          }
                        />
                      )}
                    </Field>
                  ),
                )}
              </div>
            ) : null}

            {submit.error ? (
              <Callout tone="danger" title="Your request was not sent">
                {submit.error.message} Nothing has been lost — fix the point above and send it
                again.
              </Callout>
            ) : null}

            {missing.length ? (
              <p className="intake-missing">Still needed: {missing.join(", ")}.</p>
            ) : null}

            <Button
              disabled={submit.isPending || !form.data || missing.length > 0}
              onClick={() => submit.mutate()}
            >
              <Send size={15} />{" "}
              {submit.isPending ? "Sending your request…" : "Send this request to the team"}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
