import { Lock, Tags, Trash2 } from "lucide-react";
import { SplitShell, Wordmark } from "@/components/brand";

const POINTS = [
  { icon: Tags, text: "Categories you describe in plain words, filed by Jev" },
  { icon: Trash2, text: "Junk swept to Trash in one click, with undo", accent: true },
  { icon: Lock, text: "Your mail and keys are visible only to your account" },
];

/** Sign-in, sign-up and password pages: the brand panel, then a heading and the form. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <SplitShell
      width="max-w-sm"
      aside={
        <>
          <Wordmark />
          <div className="mt-auto space-y-8">
            <p className="text-4xl leading-tight font-semibold tracking-tight text-balance">Your inbox, sorted in plain words.</p>
            <ul className="space-y-4">
              {POINTS.map((p) => (
                <li key={p.text} className="flex items-center gap-3 text-base text-muted-foreground">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background/60">
                    <p.icon className={p.accent ? "size-4 text-sweep" : "size-4 text-foreground"} aria-hidden />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-12 text-sm text-muted-foreground">Gmail through Composio · reading by Jev</p>
        </>
      }
    >
      <div className="rise-in space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-base text-pretty text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </SplitShell>
  );
}
