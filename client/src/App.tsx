import { useEffect, useState } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'
import { socket, ONLINE_SERVER_URL, LOCAL_SERVER_URL } from './network/socket'
import { loadOfflineGems, saveOfflineGems, loadOfflineUpgrades, saveOfflineUpgrades } from '../storage/offlineStorage'
import { UPGRADE_NODES } from '../../protocol/upgrade-nodes'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('upgrades')
  const [playerName, setPlayerName] = useState('Player')
  const [isDead, setIsDead] = useState(true)
  const [online, setOnline] = useState(false)
  const [gems, setGems] = useState(0)
  const [purchasedUpgrades, setPurchasedUpgrades] = useState<string[]>([])

  useEffect(() => {
  let cancelled = false
  async function switchMode() {
    phaserGame?.scene.stop('GameScene')
    await socket.disconnect()
    if (cancelled) return
    if (online) {
      socket.connect(ONLINE_SERVER_URL)
      socket.onWelcome((id, gems, upgrades) => {
        if (!cancelled) {
          setGems(gems) 
          setPurchasedUpgrades(upgrades ?? [])
        }
      })
    } else {
      socket.connect(LOCAL_SERVER_URL)
      const [g, upgrades] = await Promise.all([
          loadOfflineGems(),
          loadOfflineUpgrades(),
        ])
      if (cancelled) return
      setGems(g)
      setPurchasedUpgrades(upgrades)
      socket.onWelcome(async (id, gems) => {
        //
      })
    }
    phaserGame?.scene.start('GameScene')
  }
  switchMode()
  return () => { cancelled = true }
}, [online])

async function handlePurchaseUpgrade(nodeId: string): Promise<boolean> {
    if (online) {
      socket.send(JSON.stringify({ type: 'purchase_upgrade', nodeId }))
      return true // TODO: make it based off server response once that's implemented
    }

    // Offline: validate and apply locally
    const node = UPGRADE_NODES.find(n => n.id === nodeId)
    if (!node) return false
    if (purchasedUpgrades.includes(nodeId)) return false
    if (!node.parents.every(pid => purchasedUpgrades.includes(pid))) return false // Check parents are all purchased

    // Check affordability (TODO: gems only for now — extend for cores later)
    for (const cost of node.cost) {
      if (cost.currency === 'gem' && gems < cost.amount) return false
    }

    // Apply
    const gemCost = node.cost.find(c => c.currency === 'gem')?.amount ?? 0
    const newGems = gems - gemCost
    const newUpgrades = [...purchasedUpgrades, nodeId]

    setGems(newGems)
    setPurchasedUpgrades(newUpgrades)
    await saveOfflineGems(newGems)
    await saveOfflineUpgrades(newUpgrades)
    return true
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />
      <GameHud
        screen={screen}
        playerName={playerName}
        isDead={isDead}
        setIsDead={setIsDead}
        onHome={() => setScreen('startMenu')}
        onUpgrades={() => setScreen('upgrades')}
        onRespawn={() => setScreen('game')}
      />
      {screen === 'startMenu' && (
      <StartMenu 
        online={online}
        setOnline={setOnline}
        gems={gems}
        onPlay={(name) => {
          setPlayerName(name)
          setIsDead(false)
          setScreen('game')
          socket.send(JSON.stringify({ type: 'respawn', name }))
        }}
        onUpgrades={() => setScreen('upgrades')}
      />
      )}
      {screen === 'upgrades' && (
        <UpgradesScreen 
          onBack={() => setScreen('startMenu')}
          purchasedUpgrades={purchasedUpgrades}
          gems={gems}
          online={online}
          onPurchase={handlePurchaseUpgrade}
          />
        )}
    </div>
  )
}