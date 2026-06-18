export const TICK_MS = 50

export const WORLD_WIDTH = 4000
export const WORLD_HEIGHT = 4000
export const WORLD_PADDING = 200

export const COLOR_BACKGROUND = 0x444444
export const COLOR_OUTER_BOUNDS = 0x544e4e

export const PLAYER_BASE_HP = 100
export const SQUARE_BASE_HP = 30
export const PLAYER_BASE_RADIUS = 25
export const PLAYER_BASE_SPEED = 10
export const COLLISION_COOLDOWN = 400
export const BOT_OBSTACLE_AVOIDANCE_DIST = 200
export const SQR_COLLISION_BASE_DMG = 40
export const SQR_COLLISION_DMG_FACTOR = 0.002
export const PLAYER_COLLISION_DAMAGE = 80
export const MIN_OBSTACLE_SPAWN_DIST = 300

export const SQR_BASE_ROT_SPEED = 0.05
export const MAX_SQR_ROT_SPEED = 3

export const STEAL_PLAYER_XP_MULTIPLIER = 0.4 // ratio of victim's xp to keep, in addition to base kill xp
export const KILL_PLAYER_BASE_XP = 500 // reward this xp for any player kill + steal some of victim's xp
export const KILL_SQUARE_XP_MULTIPLIER = 0.3