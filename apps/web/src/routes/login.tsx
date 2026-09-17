import { Button } from "@rexops/ui";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, MoveRight, TriangleAlert, Upload, Users } from "lucide-react";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { routeForRole } from "../lib/role-route";

/**
 * A sign-in failure has several causes and the user can only fix some of them.
 * The screen used to answer every one of them with "That email and password
 * don't match", which sends somebody whose account is suspended, or who is
 * offline, to keep retyping a correct password.
 */
function signInProblem(error: { status?: number; code?: string; message?: string }) {
  const code = (error.code ?? "").toUpperCase();
  if (error.status === 429) {
    return {
      title: "Too many attempts",
      body: "Sign-in is blocked for a few minutes after repeated failures. Wait a moment and try again.",
    };
  }
  if (error.status === 403 || code.includes("BANNED")) {
    return {
      title: "This account has been suspended",
      body: "An owner in your workspace can lift the suspension. Nothing has been deleted.",
    };
  }
  if (code.includes("EMAIL_NOT_VERIFIED")) {
    return {
      title: "This email address has not been confirmed",
      body: "Open the confirmation link we sent you, then sign in again.",
    };
  }
  if (error.status === 0 || code.includes("FETCH") || code.includes("NETWORK")) {
    return {
      title: "Could not reach RexOps",
      body: "Your details were not sent. Check your connection and try again.",
    };
  }
  return {
    title: "That email and password do not match",
    body: "Check for a stray space, and that you are using the address your workspace invited. Passwords are case-sensitive.",
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setProblem(signInProblem(result.error));
        return;
      }
      const user = result.data?.user as { role?: string } | undefined;
      await navigate({ to: routeForRole(user?.role) });
    } catch {
      setProblem(signInProblem({ status: 0 }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-aside">
        <div className="wordmark wordmark--large">
          <span className="wordmark__mark">R</span>
          <span>RexOps</span>
        </div>
        <div className="login-aside__statement">
          <span className="rx-eyebrow">What this is</span>
          <h1>Where creative work gets reviewed, approved and signed off.</h1>
          <p>
            Agencies upload each cut of a deliverable here. Their team reviews it, the client
            reviews it, and every comment and approval is recorded against the exact version it was
            made on.
          </p>
        </div>

        {/* Three lines, in pipeline order, so someone who has never used RexOps
            can tell from the sign-in screen what they are signing in to do. */}
        <ol className="login-explainer">
          <li>
            <Upload size={16} aria-hidden="true" />
            <div>
              <strong>The agency uploads a version</strong>
              <span>Each upload is numbered, so nobody argues about which cut they saw.</span>
            </div>
          </li>
          <li>
            <Users size={16} aria-hidden="true" />
            <div>
              <strong>Reviewers comment on the frame or region</strong>
              <span>Internal review first, then the client. Comments stick to the timecode.</span>
            </div>
          </li>
          <li>
            <CheckCircle2 size={16} aria-hidden="true" />
            <div>
              <strong>Someone approves it, on the record</strong>
              <span>Who approved what, and when, is stored and cannot be quietly changed.</span>
            </div>
          </li>
        </ol>

        <small>RexOps / production system 0.1</small>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={signIn} noValidate>
          <span className="rx-eyebrow">Sign in</span>
          <h2>Sign in to your workspace</h2>
          <p>
            For agency teams and for clients reviewing work. Use the email address your invitation
            was sent to — the screens you see depend on the role attached to it.
          </p>

          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@studio.com"
              required
            />
          </label>

          <label>
            Password
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            <small className="login-card__hint">
              If you were invited, this is the temporary password in your invitation email. You can
              change it once you are in.
            </small>
          </label>

          {problem ? (
            <div className="form-error form-error--rich" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <div>
                <strong>{problem.title}</strong>
                <span>{problem.body}</span>
              </div>
            </div>
          ) : null}

          <Button type="submit" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in to RexOps"} <MoveRight size={16} />
          </Button>

          {/* RexOps has no self-serve signup: agencies are provisioned by whoever
              runs the install, and everyone else is invited. Saying so beats a
              "Create account" link that cannot work. */}
          <p className="login-card__footnote">
            <strong>No account yet?</strong> RexOps accounts are created by invitation. If you are a
            client, your agency invites you. If you are an agency, ask whoever runs this RexOps
            install to set your workspace up. Lost your password? An owner in your workspace can
            issue a new one.
          </p>

          {import.meta.env.DEV ? (
            <div className="demo-routes">
              <span>Local development only</span>
              <button
                type="button"
                onClick={() => {
                  setEmail("manas@trex.test");
                  setPassword("rexops-demo");
                }}
              >
                Fill demo credentials
              </button>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
