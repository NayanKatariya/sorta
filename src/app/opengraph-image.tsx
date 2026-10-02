import { ImageResponse } from "next/og";

export const alt = "Sorta: your inbox, sorted in plain words";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** JetBrains Mono from Google Fonts, subset to the text drawn. Falls back to the built-in font if it can't be fetched. */
async function mono(weight: number, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

const KICKER = "// gmail triage, in plain words";
const HEAD = ["Your inbox, sorted", "in plain words."];
const SUB = "Jev files every email into your categories and sweeps the junk.";
const ROWS = [
  { label: "Receipts", n: 128, w: 1 },
  { label: "Work", n: 86, w: 0.68 },
  { label: "Newsletters", n: 41, w: 0.34 },
];

export default async function Image() {
  const all = ["sorta", KICKER, ...HEAD, SUB, ...ROWS.map((r) => r.label + r.n)].join("");
  const [regular, bold] = await Promise.all([mono(400, all), mono(600, all)]);
  const fonts = [
    ...(regular ? [{ name: "JetBrains Mono", data: regular, weight: 400 as const }] : []),
    ...(bold ? [{ name: "JetBrains Mono", data: bold, weight: 600 as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0a",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          color: "#fafafa",
          fontFamily: "JetBrains Mono",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>
          <svg width="44" height="44" viewBox="0 0 16 16">
            <rect x="1" y="2" width="14" height="3" rx="1" fill="#fafafa" />
            <rect x="1" y="6.5" width="9.5" height="3" rx="1" fill="#fafafa" fillOpacity="0.7" />
            <rect x="1" y="11" width="5" height="3" rx="1" fill="#fafafa" fillOpacity="0.4" />
          </svg>
          sorta
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 680 }}>
            <div style={{ fontSize: 24, color: "#a1a1a1" }}>{KICKER}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 20, fontSize: 64, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3 }}>
              <span>{HEAD[0]}</span>
              <span style={{ color: "#a1a1a1" }}>{HEAD[1]}</span>
            </div>
            <div style={{ marginTop: 24, fontSize: 24, lineHeight: 1.4, color: "#a1a1a1" }}>{SUB}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 320, padding: 24, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "#141414" }}>
            {ROWS.map((r) => (
              <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}>
                  <span>{r.label}</span>
                  <span style={{ color: "#a1a1a1" }}>{r.n}</span>
                </div>
                <div style={{ display: "flex", height: 8, width: `${r.w * 100}%`, borderRadius: 4, background: "#fafafa", opacity: 0.25 + r.w * 0.6 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
