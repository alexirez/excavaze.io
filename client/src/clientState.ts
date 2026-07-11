import { currentLevel } from '../../protocol/utils'
import { ClientPlayer } from './entities'

export const clientPlayers = new Map<number, ClientPlayer>()

export function setClientPlayer(id: number, cp: ClientPlayer) {
  clientPlayers.set(id, cp)
}

export function getClientPlayer(id: number): ClientPlayer | undefined {
  return clientPlayers.get(id)
}

export function deleteClientPlayer(id: number) {
  clientPlayers.delete(id)
}

export function clearClientPlayers() {
  clientPlayers.clear()
}

export const CLIENT_QUEST_GETTERS: Record<string, (player: ClientPlayer, spawnedAt: number | null) => number> = {
  reach_xp: (player) => player.snapshot.xp,
  reach_level: (player) => currentLevel(player.snapshot.xp),
  survive_duration: (_player, spawnedAt) => spawnedAt !== null ? (Date.now() - spawnedAt) / 1000 : 0,
}