// Simple SVG staff with a single note drawn at the correct line/space position

interface Props {
  noteName: string; // e.g. "E4", "G5"
  clef?: 'treble' | 'bass';
  width?: number;
  height?: number;
}

// Treble staff: lines are E4 F4 G4 A4 B4 C5 D5 E5 (bottom to top)
// staffY index: 0 = E4 (first ledger below), lines: 1=E4, 2=F4 (space), 3=G4 (line 2), etc.
// Line positions from bottom: line1=E4, line2=G4, line3=B4, line4=D5, line5=F5
// Space positions: sp1=F4, sp2=A4, sp3=C5, sp4=E5

const TREBLE_POSITION: Record<string, number> = {
  C4: 10, D4: 9.5, E4: 9, F4: 8.5, G4: 8, A4: 7.5, B4: 7,
  C5: 6.5, D5: 6, E5: 5.5, F5: 5, G5: 4.5, A5: 4, B5: 3.5, C6: 3,
};

const BASS_POSITION: Record<string, number> = {
  G2: 9, A2: 8.5, B2: 8, C3: 7.5, D3: 7, E3: 6.5, F3: 6, G3: 5.5,
  A3: 5, B3: 4.5, C4: 4, D4: 3.5, E4: 3, F4: 2.5,
};

export function StaffNotation({ noteName, clef = 'treble', width = 220, height = 120 }: Props) {
  const positions = clef === 'treble' ? TREBLE_POSITION : BASS_POSITION;
  const posIndex = positions[noteName] ?? 6;

  const staffTop = 25;
  const lineSpacing = 10;
  const noteX = width / 2 + 20;
  const noteY = staffTop + posIndex * lineSpacing;

  // needs ledger line below staff (for C4 in treble)
  const needsLedgerBelow = clef === 'treble' && (noteName === 'C4' || noteName === 'D4');
  const needsLedgerAbove = clef === 'treble' && (noteName === 'A5' || noteName === 'B5' || noteName === 'C6');

  return (
    <svg width={width} height={height} role="img" aria-label={`Staff notation showing ${noteName}`}>
      {/* Staff lines */}
      {[0, 1, 2, 3, 4].map(i => (
        <line
          key={i}
          x1={30}
          y1={staffTop + (i + 1) * lineSpacing * 2}
          x2={width - 10}
          y2={staffTop + (i + 1) * lineSpacing * 2}
          stroke="#8b7cf8"
          strokeWidth={1.2}
          opacity={0.7}
        />
      ))}

      {/* Treble clef symbol (simplified text) */}
      {clef === 'treble' && (
        <text x={32} y={staffTop + 42} fontSize={52} fill="#a78bfa" opacity={0.8} fontFamily="serif">
          𝄞
        </text>
      )}

      {/* Bass clef symbol */}
      {clef === 'bass' && (
        <text x={32} y={staffTop + 30} fontSize={34} fill="#a78bfa" opacity={0.8} fontFamily="serif">
          𝄢
        </text>
      )}

      {/* Ledger lines */}
      {needsLedgerBelow && (
        <line
          x1={noteX - 12}
          y1={staffTop + 10 * lineSpacing}
          x2={noteX + 12}
          y2={staffTop + 10 * lineSpacing}
          stroke="#a78bfa"
          strokeWidth={1.5}
        />
      )}
      {needsLedgerAbove && (
        <line
          x1={noteX - 12}
          y1={staffTop + 0}
          x2={noteX + 12}
          y2={staffTop + 0}
          stroke="#a78bfa"
          strokeWidth={1.5}
        />
      )}

      {/* Note head */}
      <ellipse
        cx={noteX}
        cy={noteY}
        rx={7}
        ry={5.5}
        fill="#c4b5fd"
        stroke="#7c3aed"
        strokeWidth={1.5}
        transform={`rotate(-15, ${noteX}, ${noteY})`}
      />

      {/* Stem */}
      <line
        x1={noteX + 6}
        y1={noteY}
        x2={noteX + 6}
        y2={noteY - 35}
        stroke="#c4b5fd"
        strokeWidth={1.5}
      />
    </svg>
  );
}
