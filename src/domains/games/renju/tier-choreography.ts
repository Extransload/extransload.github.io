import type { Dance, DanceAvatar } from './avatar-gestures';

// Timings are in seconds and shared by every rig. The authored phrases use
// different footwork, held silhouettes and returns, rather than a speed preset.
export const MOTION_DURATIONS = {
  ribbon: 7.2,
  waltz: 9,
  moonwalk: 10.8,
  constellation: 12.8,
  apotheosis: 16,
} as const;

export type TierDanceStyle = keyof typeof MOTION_DURATIONS;

type Frame = readonly [
  time: number,
  leftZ: number,
  rightZ: number,
  leftX: number,
  rightX: number,
  leftLeg: number,
  rightLeg: number,
  hipX: number,
  hipY: number,
  hipTurn: number,
  torso: number,
  head: number,
  torsoPitch: number,
  headPitch: number,
];

const REST: Frame = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const restAt = (time: number): Frame => [time, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const KEYS = [
  'leftZ',
  'rightZ',
  'leftX',
  'rightX',
  'leftLeg',
  'rightLeg',
  'hipX',
  'hipY',
  'hipTurn',
  'torso',
  'head',
  'torsoPitch',
  'headPitch',
] as const satisfies readonly (keyof Dance)[];

const PHRASES: Record<TierDanceStyle, readonly Frame[]> = {
  ribbon: [
    REST,
    // Light alternating skips; each lifted foot leads a different arm arc.
    [0.7, -0.26, 0.08, -0.28, 0.06, 0.36, -0.14, -0.07, 0.075, -0.1, -0.06, 0.07, 0.02, 0],
    [1.25, -0.04, 0.36, 0.06, -0.36, -0.14, 0.32, 0.07, 0.025, 0.16, 0.08, -0.06, 0, -0.03],
    [1.85, -0.36, 0.12, -0.4, -0.06, 0.4, -0.18, -0.09, 0.085, -0.16, -0.09, 0.08, 0.02, 0],
    [2.5, 0.16, 0.42, -0.18, -0.44, -0.16, 0.38, 0.08, 0.035, 0.24, 0.1, -0.08, 0, -0.04],
    // Gather the ribbon, draw a figure eight, then a two-foot landing and bow.
    [3.2, -0.32, 0.32, -0.52, -0.52, 0.04, 0.04, 0, 0.065, 0, 0, 0, -0.04, -0.06],
    [3.95, 0.22, -0.08, 0.02, -0.24, -0.24, 0.22, 0.095, 0.015, 0.32, 0.12, -0.07, 0.03, 0.04],
    [4.7, -0.08, -0.22, -0.24, 0.02, 0.22, -0.24, -0.095, 0.015, -0.32, -0.12, 0.07, 0.03, 0.04],
    [5.25, -0.38, 0.38, -0.2, -0.2, 0.16, 0.16, 0, 0.09, 0, 0, 0, -0.04, -0.04],
    [5.75, 0.12, -0.12, -0.14, -0.14, 0.04, 0.04, 0, 0, 0, 0, 0, 0.13, 0.1],
    [6.25, 0.12, -0.12, -0.14, -0.14, 0.04, 0.04, 0, 0, 0, 0, 0, 0.13, 0.1],
    restAt(7.2),
  ],
  waltz: [
    REST,
    // Open ballroom frame, transfer weight, and sweep into a balanced turn.
    [1.05, -0.38, 0.22, -0.36, -0.6, 0.12, -0.08, -0.06, 0.02, -0.22, 0.05, 0.08, -0.02, -0.04],
    [1.8, -0.48, 0.26, -0.48, -0.3, 0.38, -0.2, -0.15, 0.035, -0.48, 0.1, 0.06, 0.03, -0.02],
    [2.65, -0.24, 0.42, -0.6, -0.24, 0.16, -0.18, -0.11, 0.07, -0.8, 0.12, -0.06, -0.07, -0.08],
    [3.5, -0.52, 0.48, -0.12, -0.22, -0.16, 0.3, 0.08, 0.04, -0.35, -0.08, -0.08, -0.04, -0.08],
    // Close the frame before changing direction, rather than snapping a turn.
    [4.35, 0.12, -0.12, -0.48, -0.48, 0.08, 0.08, 0, 0.015, 0.08, 0, 0.05, 0.06, 0.03],
    [5.15, -0.26, 0.48, -0.3, -0.48, -0.2, 0.38, 0.15, 0.035, 0.48, -0.1, -0.06, 0.03, -0.02],
    [5.95, -0.42, 0.24, -0.24, -0.6, -0.18, 0.16, 0.11, 0.07, 0.8, -0.12, 0.06, -0.07, -0.08],
    [6.8, -0.48, 0.52, -0.22, -0.12, 0.3, -0.16, -0.08, 0.04, 0.35, 0.08, 0.08, -0.04, -0.08],
    [7.65, 0.16, -0.16, -0.3, -0.3, 0.08, 0.08, 0, 0, 0, 0, 0, 0.2, 0.13],
    [8.1, 0.16, -0.16, -0.3, -0.3, 0.08, 0.08, 0, 0, 0, 0, 0, 0.2, 0.13],
    restAt(9),
  ],
  moonwalk: [
    REST,
    // Draw inward, cross-step, glide, and rise through a pirouette accent.
    [0.85, 0.24, -0.24, -0.62, -0.62, -0.14, 0.3, -0.06, 0.01, -0.24, -0.06, 0.08, 0.04, 0.08],
    [1.6, -0.14, 0.48, -0.5, -0.12, 0.42, -0.32, 0.17, 0.025, 0.22, -0.12, -0.08, 0.03, -0.05],
    [2.35, -0.44, 0.14, -0.24, -0.72, 0.12, -0.22, 0.1, 0.06, 0.78, 0.09, -0.1, -0.06, -0.06],
    [3.05, -0.62, 0.58, -0.72, -0.68, 0.32, 0.08, 0, 0.13, 1.15, 0.04, -0.12, -0.1, -0.1],
    [3.55, -0.24, 0.16, -0.44, -0.2, -0.2, 0.18, -0.03, 0.015, 0.58, -0.08, 0.08, 0.08, 0.04],
    // Reverse the crossing foot, then uncurl into a long crescent silhouette.
    [4.45, 0.16, -0.16, -0.54, -0.54, 0.28, -0.16, 0.08, 0.01, 0.18, 0.05, -0.08, 0.06, 0.07],
    [5.35, -0.48, 0.14, -0.12, -0.5, -0.32, 0.42, -0.17, 0.025, -0.3, 0.12, 0.08, 0.03, -0.05],
    [6.2, -0.14, 0.44, -0.72, -0.24, -0.22, 0.12, -0.1, 0.06, -0.82, -0.09, 0.1, -0.06, -0.06],
    [7, -0.58, 0.62, -0.68, -0.72, 0.08, 0.32, 0, 0.13, -1.15, -0.04, 0.12, -0.1, -0.1],
    [8.1, -0.64, 0.38, -0.18, -0.52, -0.14, 0.3, 0.08, 0.06, -0.4, -0.14, 0.08, -0.07, -0.1],
    [8.9, -0.64, 0.38, -0.18, -0.52, -0.14, 0.3, 0.08, 0.06, -0.4, -0.14, 0.08, -0.07, -0.1],
    [9.8, 0.18, -0.18, -0.26, -0.26, 0.06, 0.06, 0, 0, 0, 0, 0, 0.18, 0.1],
    restAt(10.8),
  ],
  constellation: [
    REST,
    // Trace three points in the sky, with the gaze following the leading arm.
    [1.1, -0.6, 0.06, -0.7, -0.12, 0.14, -0.08, -0.06, 0.035, -0.22, -0.1, 0.14, -0.04, -0.12],
    [2.2, -0.14, 0.66, -0.3, -0.76, -0.1, 0.2, 0.06, 0.055, 0.26, 0.12, -0.14, -0.06, -0.14],
    [3.05, -0.62, 0.62, -0.5, -0.5, 0.12, 0.12, 0, 0.1, 0, 0, 0, -0.08, -0.16],
    [3.65, -0.62, 0.62, -0.5, -0.5, 0.12, 0.12, 0, 0.1, 0, 0, 0, -0.08, -0.16],
    // Travel through an extended turn phrase and coil before the star pose.
    [4.45, -0.46, 0.16, -0.14, -0.64, 0.44, -0.24, -0.2, 0.03, -0.52, 0.14, 0.12, 0.06, -0.04],
    [5.45, 0.2, -0.2, -0.68, -0.68, 0.22, -0.26, -0.1, 0.085, -1.28, 0.06, -0.14, -0.04, -0.08],
    [6.35, -0.16, 0.46, -0.64, -0.14, -0.24, 0.44, 0.2, 0.035, 0.4, -0.14, -0.12, 0.06, -0.04],
    [7.25, 0.26, -0.26, -0.7, -0.7, -0.18, -0.18, 0, -0.025, 0.92, 0, 0.1, 0.18, 0.1],
    [8.2, -0.7, 0.7, -0.32, -0.32, 0.34, -0.12, 0, 0.155, 0.25, -0.1, -0.1, -0.12, -0.16],
    // Suspended silhouette is deliberately held; no endless flapping.
    [9.15, -0.7, 0.7, -0.32, -0.32, 0.34, -0.12, 0, 0.155, 0.25, -0.1, -0.1, -0.12, -0.16],
    [10.2, -0.7, 0.7, -0.32, -0.32, 0.34, -0.12, 0, 0.155, 0.25, -0.1, -0.1, -0.12, -0.16],
    [11.5, 0.1, -0.1, -0.32, -0.32, 0.06, 0.06, 0, 0, 0, 0, 0, 0.22, 0.14],
    restAt(12.8),
  ],
  apotheosis: [
    REST,
    // Entrance: two measured steps, an invitation, then a three-part spiral.
    [0.8, 0.16, -0.1, -0.22, -0.46, 0.26, -0.12, -0.06, 0.015, -0.18, -0.06, 0.06, 0.05, 0.03],
    [1.65, -0.22, 0.34, -0.5, -0.2, -0.1, 0.3, 0.08, 0.035, 0.18, 0.08, -0.1, 0.01, -0.06],
    [2.5, -0.5, 0.5, -0.42, -0.42, 0.12, 0.12, 0, 0.065, 0, 0, 0, -0.08, -0.12],
    [3.45, -0.62, 0.1, -0.7, -0.18, 0.42, -0.22, -0.19, 0.045, -0.64, 0.12, 0.1, -0.04, -0.08],
    [4.5, 0.26, -0.26, -0.76, -0.76, 0.2, -0.28, -0.06, 0.12, -1.42, 0.04, -0.12, -0.1, -0.12],
    [5.6, -0.16, 0.64, -0.2, -0.66, -0.24, 0.44, 0.21, 0.055, -0.28, -0.14, -0.1, -0.04, -0.08],
    // Compress, unfold every limb, then present a quiet crown-shaped finale.
    [6.4, 0.3, -0.3, -0.72, -0.72, -0.22, -0.22, 0, -0.03, 0.4, 0, 0.06, 0.2, 0.1],
    [7.45, -0.76, 0.76, -0.58, -0.58, 0.4, -0.18, -0.03, 0.18, 1.24, -0.14, -0.12, -0.14, -0.18],
    [8.45, -0.68, 0.34, -0.18, -0.7, -0.18, 0.36, 0.17, 0.1, 0.72, 0.16, -0.12, -0.1, -0.14],
    [9.5, -0.64, 0.64, -0.74, -0.74, 0.18, 0.18, 0, 0.15, 0, 0, 0, -0.12, -0.18],
    [10.5, -0.64, 0.64, -0.74, -0.74, 0.18, 0.18, 0, 0.15, 0, 0, 0, -0.12, -0.18],
    [11.5, -0.64, 0.64, -0.74, -0.74, 0.18, 0.18, 0, 0.15, 0, 0, 0, -0.12, -0.18],
    // Lower through the elbows, acknowledge the audience, and return to rest.
    [12.5, -0.4, 0.4, -0.28, -0.28, 0.06, 0.06, 0, 0.025, -0.2, 0.04, 0.06, 0.04, 0.04],
    [13.65, 0.18, -0.18, -0.38, -0.38, 0.08, 0.08, 0, -0.015, 0, 0, 0, 0.26, 0.18],
    [14.35, 0.18, -0.18, -0.38, -0.38, 0.08, 0.08, 0, -0.015, 0, 0, 0, 0.26, 0.18],
    restAt(16),
  ],
};

// Personality stays with the avatar: restrained Rose, buoyant Milly, confident
// Serin, graceful Luna, and a compact phrase that fits Petal's smaller skeleton.
const EXPRESSION: Record<DanceAvatar, { reach: number; stride: number; sway: number }> = {
  petal: { reach: 0.92, stride: 0.88, sway: 0.92 },
  luna: { reach: 1, stride: 1, sway: 1 },
  apron: { reach: 0.94, stride: 1.08, sway: 0.96 },
  rose: { reach: 0.88, stride: 0.9, sway: 0.9 },
  serin: { reach: 1.04, stride: 1.02, sway: 1.04 },
};

export function sampleTierVictoryDance(style: DanceAvatar, variant: TierDanceStyle, elapsed: number): Dance {
  const duration = MOTION_DURATIONS[variant];
  const time = ((elapsed % duration) + duration) % duration;
  const frames = PHRASES[variant];
  const next = frames.findIndex((frame) => frame[0] > time);
  const from = frames[next - 1];
  const to = frames[next];
  const phase = (time - from[0]) / (to[0] - from[0]);
  // Quintic easing yields zero velocity and acceleration at every hold and
  // at the loop boundary. No added sine wave disturbs a deliberate still pose.
  const blend = phase * phase * phase * (phase * (phase * 6 - 15) + 10);
  const sampled = Object.fromEntries(
    KEYS.map((key, index) => [key, from[index + 1] + (to[index + 1] - from[index + 1]) * blend]),
  ) as Required<Dance>;
  const expression = EXPRESSION[style];
  for (const key of ['leftZ', 'rightZ', 'leftX', 'rightX'] as const) sampled[key] *= expression.reach;
  for (const key of ['leftLeg', 'rightLeg', 'hipX', 'hipY'] as const) sampled[key] *= expression.stride;
  for (const key of ['hipTurn', 'torso', 'head', 'torsoPitch', 'headPitch'] as const) sampled[key] *= expression.sway;
  return sampled;
}
