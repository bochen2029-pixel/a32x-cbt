// Reverse thrust as the view shows it, from the core's own reverser_1 and reverser_2 slots (0 stowed .. 1 deployed):
// REV in amber while a reverser's doors move and in green once they are fully open, as the A320's engine display
// shows it; and how far each of the CFM56-5's pivoting doors stands out of its cowl. Plain numbers: node tests them.
// GPLv3.

// How far a pivoting door swings out when deployed. Illustrative: the view shows the doors open, not a measured angle.
export const DOOR_OPEN_DEG = 32;

// A reverser's position, as its light shows it: 'stowed' (no light), 'transit' (amber), 'deployed' (green).
export function reverserState(v) {
  if (!Number.isFinite(v) || v <= 0.001) return 'stowed';
  return v >= 0.999 ? 'deployed' : 'transit';
}

// The engines whose reversers are out, engine 1 first: [{ engine, state }]. A core without the slots has none.
export function reversers(s) {
  return [1, 2].map((engine) => ({ engine, state: reverserState(s[`reverser_${engine}`]) })).filter((r) => r.state !== 'stowed');
}

// A door's angle out of the cowl, in radians: none stowed, DOOR_OPEN_DEG deployed, in proportion while it moves.
export function doorAngle(v) {
  return Number.isFinite(v) ? (Math.max(0, Math.min(1, v)) * DOOR_OPEN_DEG * Math.PI) / 180 : 0;
}
