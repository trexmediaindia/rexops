import { Button, Callout, EmptyState, Skeleton } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Download, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { uploadAttachment } from "../lib/attachment-upload";
import { downloadAttachment } from "../lib/download";
import { request } from "../lib/request";

export type AdReport = {
  id: string;
  platform: "META" | "GOOGLE" | "OTHER";
  periodStart: string;
  periodEnd: string;
  currency: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  revenue: number | null;
  summary: string | null;
  attachmentId: string | null;
  createdAt: string;
};

const PLATFORM_LABEL = {
  META: "Meta (Facebook & Instagram)",
  GOOGLE: "Google Ads",
  OTHER: "Other",
};

const NUMBER_FIELDS = [
  { key: "spend", label: "Spend", money: true },
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "clicks", label: "Clicks" },
  { key: "leads", label: "Leads" },
  { key: "conversions", label: "Conversions" },
  { key: "revenue", label: "Revenue", money: true },
] as const;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-IN")}`;
  }
}

function period(report: AdReport) {
  // Periods are whole days; read them in UTC so a viewer's time zone can't shift them.
  const start = new Date(report.periodStart);
  const end = new Date(report.periodEnd);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const wholeMonth =
    start.getUTCDate() === 1 &&
    end.getUTCFullYear() === start.getUTCFullYear() &&
    end.getUTCMonth() === start.getUTCMonth() &&
    end.getUTCDate() === lastDay.getUTCDate();
  if (wholeMonth) {
    return start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)} ${end.getUTCFullYear()}`;
}

/** Derived figures people actually ask about: cost per lead / click, and return on spend. */
function derived(report: AdReport) {
  const out: Array<{ label: string; value: string }> = [];
  if (report.spend && report.leads)
    out.push({
      label: "Cost per lead",
      value: money(report.spend / report.leads, report.currency),
    });
  if (report.spend && report.clicks)
    out.push({
      label: "Cost per click",
      value: money(report.spend / report.clicks, report.currency),
    });
  if (report.clicks && report.impressions)
    out.push({
      label: "Click rate",
      value: `${((report.clicks / report.impressions) * 100).toFixed(2)}%`,
    });
  if (report.spend && report.revenue)
    out.push({ label: "Return on spend", value: `${(report.revenue / report.spend).toFixed(1)}×` });
  return out;
}

/**
 * Monthly ad results for an ads project. The agency types the headline numbers from Ads
 * Manager / Google Ads and attaches the exported report; the client sees the same cards.
 * (A live Google / Meta connection can fill these in later without changing the screen.)
 */
export function AdReports({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const reports = useQuery({
    queryKey: ["ad-reports", projectId],
    queryFn: () => request<AdReport[]>(`/api/projects/${projectId}/reports`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => request(`/api/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ad-reports", projectId] }),
  });

  return (
    <section className="panel ad-reports" aria-labelledby="ad-reports-title">
      <header className="ad-reports__head">
        <div>
          <h2 id="ad-reports-title">Ad results</h2>
          <p>
            {canEdit
              ? "Add the numbers each month from Meta Ads Manager or Google Ads, and attach the exported report. The client sees these too."
              : "How your ads performed, period by period. Download the full report for the details."}
          </p>
        </div>
        {canEdit && !adding ? (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add a report
          </Button>
        ) : null}
      </header>

      {adding ? <ReportForm projectId={projectId} onDone={() => setAdding(false)} /> : null}

      {reports.isLoading ? (
        <Skeleton lines={3} label="Loading reports" />
      ) : reports.isError ? (
        <Callout tone="danger" title="Reports did not load">
          {(reports.error as Error).message}
        </Callout>
      ) : !reports.data?.length ? (
        adding ? null : (
          <EmptyState
            tone="inset"
            icon={<BarChart3 size={22} />}
            title="No reports yet"
            body={
              canEdit
                ? "Once ads are running, add a report at the end of each month."
                : "Your agency will add a report here once your ads have been running for a while."
            }
          />
        )
      ) : (
        <ol className="ad-reports__list">
          {reports.data.map((report) => (
            <li key={report.id} className="ad-report">
              <header>
                <div>
                  <strong>{period(report)}</strong>
                  <span>{PLATFORM_LABEL[report.platform]}</span>
                </div>
                <div className="ad-report__actions">
                  {report.attachmentId ? (
                    <Button
                      variant="secondary"
                      onClick={() => downloadAttachment(report.attachmentId as string)}
                    >
                      <Download size={14} /> Full report
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete the ${period(report)} report`}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this report? The client will no longer see it."))
                          remove.mutate(report.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              </header>
              <dl className="ad-report__numbers">
                {NUMBER_FIELDS.filter((field) => report[field.key] != null).map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>
                      {"money" in field
                        ? money(report[field.key] as number, report.currency)
                        : (report[field.key] as number).toLocaleString("en-IN")}
                    </dd>
                  </div>
                ))}
                {derived(report).map((item) => (
                  <div key={item.label} className="ad-report__derived">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              {report.summary ? <p className="ad-report__summary">{report.summary}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function monthBounds(month: string) {
  const [year = 2026, m = 1] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1, 12));
  const end = new Date(Date.UTC(year, m, 0, 12));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ReportForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(lastMonth());
  const [platform, setPlatform] = useState<AdReport["platform"]>("META");
  const [currency, setCurrency] = useState("INR");
  const [values, setValues] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const attachmentId = file ? await uploadAttachment(file) : undefined;
      const numbers = Object.fromEntries(
        Object.entries(values)
          .map(([key, value]) => [key, value.replace(/[,\s₹$]/g, "")])
          .filter(([, value]) => value !== ""),
      );
      return request(`/api/projects/${projectId}/reports`, {
        method: "POST",
        body: JSON.stringify({
          platform,
          currency,
          ...monthBounds(month),
          ...numbers,
          summary: summary.trim() || undefined,
          attachmentId,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ad-reports", projectId] });
      onDone();
    },
  });

  return (
    <form
      className="ad-report-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <header>
        <strong>New report</strong>
        <button type="button" className="icon-button" aria-label="Cancel" onClick={onDone}>
          <X size={16} />
        </button>
      </header>
      <div className="ad-report-form__row">
        <label>
          Month
          <input
            type="month"
            value={month}
            required
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <label>
          Platform
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as AdReport["platform"])}
          >
            <option value="META">Meta (Facebook & Instagram)</option>
            <option value="GOOGLE">Google Ads</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Currency
          <input
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </label>
      </div>
      <p className="ad-report-form__hint">Fill in the numbers you have. Leave the rest blank.</p>
      <div className="ad-report-form__numbers">
        {NUMBER_FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              inputMode="decimal"
              value={values[field.key] ?? ""}
              placeholder="—"
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <label>
        What happened this month <span className="ad-report-form__optional">optional</span>
        <textarea
          rows={3}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="e.g. Leads up 18% after we moved budget to the Reels placement. Next month: test a new offer."
        />
      </label>
      <label className="ad-report-form__file">
        <Paperclip size={15} />
        {file ? file.name : "Attach the exported report (PDF, CSV or Excel)"}
        <input
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {save.error ? (
        <Callout tone="danger" title="The report was not saved">
          {(save.error as Error).message}
        </Callout>
      ) : null}
      <div className="ad-report-form__actions">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save report"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
