import type { ChordPosition } from "@/server/voicings";

const STRINGS = 6;
const FRETS = 4;
const W = 64;
const H = 78;
const LEFT = 10;
const TOP = 16;
const SX = (W - LEFT * 2) / (STRINGS - 1);
const SY = (H - TOP - 6) / FRETS;

/** SVG guitar chord box (low E on the left). */
export function ChordDiagram({ name, position }: { name: string; position: ChordPosition }) {
  const x = (s: number) => LEFT + s * SX;
  const y = (f: number) => TOP + f * SY;
  const showNut = position.baseFret === 1;

  return (
    <figure className="flex flex-col items-center">
      <figcaption className="mb-0.5 text-sm font-semibold">{name}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W * 1.25}
        height={H * 1.25}
        role="img"
        aria-label={`${name} chord diagram`}
        className="text-foreground"
      >
        {/* frets */}
        {Array.from({ length: FRETS + 1 }, (_, f) => (
          <line
            key={`f${f}`}
            x1={x(0)}
            x2={x(STRINGS - 1)}
            y1={y(f)}
            y2={y(f)}
            stroke="currentColor"
            strokeOpacity={f === 0 && showNut ? 1 : 0.35}
            strokeWidth={f === 0 && showNut ? 2.5 : 1}
          />
        ))}
        {/* strings */}
        {Array.from({ length: STRINGS }, (_, s) => (
          <line
            key={`s${s}`}
            x1={x(s)}
            x2={x(s)}
            y1={y(0)}
            y2={y(FRETS)}
            stroke="currentColor"
            strokeOpacity={0.5}
          />
        ))}
        {!showNut && (
          <text x={1} y={y(0) + SY * 0.65} fontSize={7} fill="currentColor">
            {position.baseFret}
          </text>
        )}
        {/* barres */}
        {position.barres.map((fret) => {
          const strings = position.frets.map((f, s) => (f === fret ? s : -1)).filter((s) => s >= 0);
          if (strings.length < 2) return null;
          const from = Math.min(...strings);
          const to = Math.max(...strings);
          return (
            <rect
              key={`b${fret}`}
              x={x(from) - 3}
              y={y(fret - 0.5) - 3}
              width={x(to) - x(from) + 6}
              height={6}
              rx={3}
              className="fill-primary"
            />
          );
        })}
        {/* dots + open/muted markers */}
        {position.frets.map((fret, s) => {
          if (fret === -1) {
            return (
              <text
                key={`m${s}`}
                x={x(s)}
                y={TOP - 4}
                fontSize={7}
                textAnchor="middle"
                fill="currentColor"
              >
                ×
              </text>
            );
          }
          if (fret === 0) {
            return (
              <circle
                key={`o${s}`}
                cx={x(s)}
                cy={TOP - 6}
                r={2.2}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.9}
              />
            );
          }
          if (position.barres.includes(fret)) return null;
          return (
            <circle key={`d${s}`} cx={x(s)} cy={y(fret - 0.5)} r={3.2} className="fill-primary" />
          );
        })}
      </svg>
    </figure>
  );
}
