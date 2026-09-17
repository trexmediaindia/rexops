import { HelpTip } from "@rexops/ui";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type Crumb = { label: string; to?: string; params?: Record<string, string> };

/**
 * The top of every screen.
 *
 * Four things, in this order: where you are (breadcrumbs), what the screen is
 * called, what it is for in one sentence, and the one action it exists to let you
 * take. Screens used to open with a title and a marketing line, so a new user
 * could not tell what the page wanted from them.
 */
export function PageHeader({
  crumbs,
  eyebrow,
  title,
  purpose,
  help,
  primary,
  secondary,
  status,
}: {
  crumbs?: Crumb[];
  eyebrow?: string;
  title: string;
  /** One sentence: what this screen is for. Written for someone who has never seen it. */
  purpose: string;
  /** Anything that needs more than a sentence goes behind the help tip. */
  help?: ReactNode;
  /** The single action this screen exists for. */
  primary?: ReactNode;
  /** Everything else, visually subordinate. */
  secondary?: ReactNode;
  /** Live state for the screen: saving, last synced, connection. */
  status?: ReactNode;
}) {
  return (
    <div className="page-header">
      {crumbs?.length ? (
        <nav className="page-crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${crumb.to ?? "here"}`}>
              {crumb.to ? (
                // biome-ignore lint/suspicious/noExplicitAny: crumbs are built from live records
                <Link to={crumb.to as any} params={crumb.params as any}>
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
              {index < crumbs.length - 1 ? <ChevronRight size={13} aria-hidden="true" /> : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="screen-heading">
        <div className="page-header__text">
          {eyebrow ? <span className="rx-eyebrow">{eyebrow}</span> : null}
          <h1>
            {title}
            {help ? <HelpTip label={title}>{help}</HelpTip> : null}
          </h1>
          <p>{purpose}</p>
        </div>
        <div className="page-header__actions">
          {status}
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}
