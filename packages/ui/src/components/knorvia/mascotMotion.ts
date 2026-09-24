/** Pure, frame-rate independent presentation math. No agent/task state lives here. */
export interface SpringAxis {
  value: number;
  velocity: number;
}

export function advanceSpring(axis: SpringAxis, target: number, seconds: number, frequency = 16) {
  const dt = Math.max(0, Math.min(0.05, seconds));
  const offset = axis.value - target;
  const impulse = axis.velocity + frequency * offset;
  const decay = Math.exp(-frequency * dt);
  axis.value = target + (offset + impulse * dt) * decay;
  axis.velocity = (axis.velocity - frequency * impulse * dt) * decay;
}

export const clampGaze = (value: number) => Math.max(-1, Math.min(1, value));

export interface MascotInput {
  time: number;
  gazeX: number;
  gazeY: number;
  focused: boolean;
  typing: boolean;
  hovered: boolean;
  resting: boolean;
  blink: number;
  reactionAge: number;
  reaction: number;
}

export interface MascotPose {
  x: number;
  y: number;
  tilt: number;
  stretch: number;
  eyeX: number;
  eyeY: number;
  leftEye: number;
  rightEye: number;
  smile: number;
}

export function mascotTarget(input: MascotInput): MascotPose {
  const { time, focused, typing, hovered, resting, reactionAge } = input;
  const responding = reactionAge >= 0 && reactionAge < 1.8;
  const arc = responding ? Math.sin((Math.PI * reactionAge) / 1.8) : 0;
  const nod = responding && input.reaction % 3 === 0;
  const wink = responding && input.reaction % 3 === 1;
  const gazeX = clampGaze(input.gazeX);
  const gazeY = clampGaze(input.gazeY);
  const blink = Math.max(0.06, 1 - input.blink);
  const eye = resting ? 0.34 : typing ? 0.88 : hovered ? 1.04 : 1;
  const winkAmount = wink ? Math.pow(Math.sin(Math.PI * Math.min(1, reactionAge / 1.2)), 4) : 0;
  const breath = Math.sin(time * 1.28);
  return {
    x: gazeX * 1.2,
    y:
      breath * (resting ? 0.45 : 1.1) +
      (resting ? 1.2 : 0) -
      (hovered ? 2 : 0) -
      arc * 3.6 +
      (nod ? Math.sin(reactionAge * 8) * 2.2 * arc : 0),
    tilt:
      gazeX * 2.4 + (focused ? -1.4 : 0) + (responding ? Math.sin(reactionAge * 5) * 4 * arc : 0),
    stretch: 1 + breath * 0.009 + (hovered ? 0.016 : 0) - arc * 0.022,
    eyeX: gazeX * (focused ? 3.6 : 4.4) + (typing ? Math.sin(time * 3.4) * 0.55 : 0),
    eyeY: resting ? 1.5 : gazeY * 3 + (nod ? Math.sin(reactionAge * 8) * 1.1 * arc : 0),
    leftEye: blink * eye * (1 - winkAmount * 0.92),
    rightEye: blink * eye,
    smile: wink ? 0 : arc * 0.94,
  };
}

export function canAnimateMascot(
  mode: string,
  reduced: boolean,
  visible: boolean,
  inView: boolean,
) {
  return mode === "animated" && !reduced && visible && inView;
}
