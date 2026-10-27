// How one Ask Copper answer is drawn: a rail of stations (the tools on offer,
// Copper thinking, each tool call, what's happening now) and then the reply.
// The layout is described in specs/module-2/spec.md, section 5.
import {
  BrainIcon,
  ListChecksIcon,
  type LucideIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
// Types only: tools.ts reads the stock list, so it can't be imported here.
import type {
  Availability,
  CostBreakdown,
  Prices,
  ProductList,
} from "@/lib/copper/assistant/tools";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

/** One station on the rail: a round node with an icon, then its contents. */
function Station({
  icon: Icon,
  label,
  nodeClass,
  children,
}: {
  icon?: LucideIcon;
  label?: string;
  nodeClass: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative pl-10">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-6 items-center justify-center rounded-full ring-4",
          nodeClass,
        )}
      >
        {Icon ? <Icon className="size-3.5" /> : null}
      </span>
      {label ? (
        <p className="text-muted-foreground pt-1 text-[0.65rem] font-semibold tracking-widest uppercase">
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Thinking summaries arrive as markdown: **headings** and `code`. */
function Markdown({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="mt-1">
            {paragraph.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
              if (part.startsWith("**") && part.endsWith("**"))
                return <strong key={j}>{part.slice(2, -2)}</strong>;
              if (part.startsWith("`") && part.endsWith("`"))
                return (
                  <code key={j} className="font-mono text-[0.9em]">
                    {part.slice(1, -1)}
                  </code>
                );
              return part;
            })}
          </p>
        ))}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

const productName = (id: unknown) =>
  getProducts().find((p) => p.id === id)?.name ?? String(id);
const planName = (id: unknown) =>
  getPlans().find((p) => p.id === id)?.name ?? String(id);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function SentList({ step }: { step: ToolStep }) {
  const input = record(step.input);
  if (step.name === "get_products")
    return <p>Nothing, it just asked what Copper sells.</p>;
  if (step.name === "get_prices")
    return <p>Nothing, it just asked for the price list.</p>;
  if (!input)
    return <p className="text-muted-foreground">filling in the details…</p>;

  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-0.5">
        <Row
          label="Products"
          value={
            products.length ? products.map(productName).join(", ") : "None"
          }
        />
        <Row label="Plan" value={planName(input.plan)} />
        <Row label="Billing" value={String(input.billing)} />
        <Row label="Years" value={String(input.years)} />
      </dl>
    );
  }
  if (step.name === "check_availability") {
    return (
      <dl className="space-y-0.5">
        <Row label="Product" value={productName(input.product)} />
        <Row
          label="Color"
          value={typeof input.color === "string" ? input.color : "All colors"}
        />
      </dl>
    );
  }
  return (
    <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(input)}</pre>
  );
}

const stockLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function BackList({ step }: { step: ToolStep }) {
  const output = step.output;
  if (step.state === "error")
    return <p className="text-chart-3">{String(output)}</p>;
  if (step.state === "calling" || output === undefined)
    return (
      <p className="text-muted-foreground flex items-center gap-2">
        <Spinner className="size-3" /> the app is running the code…
      </p>
    );

  if (step.name === "calculate_cost") {
    const cost = output as CostBreakdown;
    return (
      <div>
        <dl className="space-y-0.5">
          {cost.lines.map((line, i) => (
            <Row key={i} label={line.item} value={formatUsd(line.usd)} />
          ))}
        </dl>
        <div className="mt-1 flex items-baseline justify-between border-t pt-1">
          <span className="font-medium">Total</span>
          <span className="text-primary text-lg font-bold">
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
      </div>
    );
  }
  if (step.name === "get_products") {
    return (
      <div className="space-y-2">
        {(output as ProductList).products.map((p) => (
          <div key={p.id}>
            <p className="font-medium">
              {p.name} · {formatUsd(p.priceUsd)}
            </p>
            <p className="text-muted-foreground">{p.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.colors.map((color) => (
                <Pill key={color} className="bg-accent text-accent-foreground">
                  {color}
                </Pill>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (step.name === "get_prices") {
    const prices = output as Prices;
    return (
      <dl className="space-y-0.5">
        {prices.products.map((p) => (
          <Row key={p.id} label={p.name} value={formatUsd(p.priceUsd)} />
        ))}
        {prices.plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <Row
              key={plan.id}
              label={plan.name}
              value={`${formatUsd(plan.monthlyUsd)}/mo · ${formatUsd(plan.annualUsd)}/yr`}
            />
          ))}
      </dl>
    );
  }
  if (step.name === "check_availability") {
    const result = output as Availability;
    if (result.status === "not_a_color")
      return (
        <p>
          {result.product} doesn&apos;t come in {result.color}. It comes in{" "}
          {result.colors.join(", ")}.
        </p>
      );
    if (result.status === "unavailable") return <p>{result.message}</p>;
    return (
      <dl className="space-y-1">
        {result.colors.map((c) => (
          <div
            key={c.color}
            className="flex items-center justify-between gap-4"
          >
            <dt>{c.color}</dt>
            <dd>
              {c.stock === "in_stock" ? (
                <Pill className="bg-accent text-accent-foreground">
                  In stock
                </Pill>
              ) : c.stock === "low_stock" ? (
                <Pill className="bg-chart-4 text-foreground">Low stock</Pill>
              ) : (
                <Pill className="bg-chart-3 text-foreground">
                  Back-ordered
                  {c.restockDate ? ` until ${stockLabel(c.restockDate)}` : ""}
                </Pill>
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre className="font-mono whitespace-pre-wrap">
      {JSON.stringify(output)}
    </pre>
  );
}

/** A tool call: always open, what Copper sent and what came back. */
function ToolCard({ step, n }: { step: ToolStep; n: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card mt-1 overflow-hidden rounded-lg border text-xs"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="bg-card/30 rounded px-1.5 text-[0.65rem]">
          tool {n}
        </span>
        <span className="ml-auto">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-muted-foreground mb-1 text-[0.65rem] font-semibold tracking-widest uppercase">
          → What Copper sent
        </p>
        <SentList step={step} />
      </div>
      <div className="bg-accent/10 border-t px-3 py-2">
        <p className="text-muted-foreground mb-1 text-[0.65rem] font-semibold tracking-widest uppercase">
          ← What came back
        </p>
        <BackList step={step} />
      </div>
    </div>
  );
}

function nowText(progress: Progress, useTools: boolean) {
  if (progress.reply) return "Writing the answer…";
  if (progress.steps.length) return "Deciding what to do next…";
  return useTools ? "Reading your question…" : "Answering from memory…";
}

export function AnswerView({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  const used = new Set(
    progress.steps.flatMap((s) => (s.type === "tool" ? [s.name] : [])),
  );
  const accent = useTools
    ? "bg-primary text-primary-foreground"
    : "bg-chart-3 text-foreground";
  // Which call each tool step is in this answer (worked out up front, so
  // nothing is reassigned while drawing).
  const toolNumbers = progress.steps.map(
    (_, i) =>
      progress.steps.slice(0, i + 1).filter((s) => s.type === "tool").length,
  );

  return (
    <div>
      <div className="relative space-y-3">
        <span
          aria-hidden
          className={cn(
            "absolute top-2 bottom-2 left-[11px] w-0.5 rounded-full",
            useTools
              ? "from-primary via-accent to-accent bg-linear-to-b"
              : "bg-chart-3",
          )}
        />

        <Station
          icon={ListChecksIcon}
          nodeClass={accent}
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="mt-1 flex flex-wrap gap-1">
            {TOOL_NAMES.map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[0.7rem]",
                  !useTools && "line-through",
                  useTools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Copper has to answer from memory alone.
            </p>
          ) : null}
        </Station>

        {progress.steps.map((step, i) => {
          if (step.type === "thinking")
            return (
              <Station
                key={i}
                icon={BrainIcon}
                label="Copper is thinking"
                nodeClass={accent}
              >
                <div
                  data-testid="thinking"
                  className="text-muted-foreground mt-1 border-l-2 pl-3 text-xs italic"
                >
                  <Markdown text={step.text} />
                </div>
              </Station>
            );
          return (
            <Station
              key={i}
              icon={WrenchIcon}
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
              nodeClass="bg-accent text-accent-foreground"
            >
              <ToolCard step={step} n={toolNumbers[i]} />
            </Station>
          );
        })}

        {working ? (
          <Station nodeClass={accent}>
            <span
              className="absolute top-2 left-[7px] flex gap-0.5"
              aria-hidden
            >
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="bg-foreground size-1 animate-bounce rounded-full"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
            <p className="text-muted-foreground pt-0.5 text-xs">
              {nowText(progress, useTools)}
            </p>
          </Station>
        ) : null}
      </div>

      {progress.reply ? (
        <div className="bg-card mt-3 rounded-2xl rounded-tl-sm border p-3 text-sm">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools ? (
            <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border p-2 text-xs">
              <p className="flex items-center gap-1 font-semibold">
                <TriangleAlertIcon className="size-3.5" />
                <span>Answered without tools: may be made up</span>
              </p>
              <p className="mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          ) : null}
          <span className="whitespace-pre-wrap">{progress.reply}</span>
          {working ? (
            <span aria-hidden className="ml-0.5 animate-pulse">
              ▍
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
