import { Button } from "@rexops/ui";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, MoveRight, TriangleAlert, Upload, Users } from "lucide-react";
import { useState } from "react";
import { BrandMark, BrandWord } from "../components/brand-mark";
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
      body: "Ask your contact at the agency to switch it back on. Nothing has been deleted.",
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
      title: "Could not connect",
      body: "Your details were not sent. Check your connection and try again.",
    };
  }
  return {
    title: "That email and password do not match",
    body: "Check for a stray space, and that it's the email your agency set you up with. Passwords are case-sensitive.",
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
          <BrandMark />
          <BrandWord />
        </div>
        <div className="login-aside__statement">
          <h1>Review and approve your work in one place.</h1>
          <p>
            Your agency shares each new version here. You look at it, leave comments, and approve it
            when you're happy. No more hunting through email and chat.
          </p>
        </div>

        {/* Three lines, in pipeline order, so someone who has never used Creative Dock
            can tell from the sign-in screen what they are signing in to do. */}
        <ol className="login-explainer">
          <li>
            <Upload size={16} aria-hidden="true" />
            <div>
              <strong>We share the work</strong>
              <span>Every version is numbered, so it's always clear which one you're seeing.</span>
            </div>
          </li>
          <li>
            <Users size={16} aria-hidden="true" />
            <div>
              <strong>You comment</strong>
              <span>Click on the exact spot or moment you mean, and type what to change.</span>
            </div>
          </li>
          <li>
            <CheckCircle2 size={16} aria-hidden="true" />
            <div>
              <strong>You approve</strong>
              <span>One click. Your approval is saved with your name and the date.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={signIn} noValidate>
          <h2>Sign in</h2>
          <p>Use the email and password your agency gave you.</p>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
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
            {busy ? "Signing in…" : "Sign in"} <MoveRight size={16} />
          </Button>

          {/* Creative Dock has no self-serve signup: agencies are provisioned by whoever
              runs the install, and everyone else is invited. Saying so beats a
              "Create account" link that cannot work. */}
          <p className="login-card__footnote">
            No login yet, or forgotten your password? Ask your contact at the agency and they'll
            sort it out.
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
