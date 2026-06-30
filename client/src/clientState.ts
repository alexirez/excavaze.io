// client/src/clientState.ts
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