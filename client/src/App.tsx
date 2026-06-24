import { useEffect, useState } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'
import { socket, ONLINE_SERVER_URL, LOCAL_SERVER_URL } from './network/socket'
import { loadOfflineGems } from '../storage/offlineStorage'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('upgrades')
  const [playerName, setPlayerName] = useState('Player')
  const [isDead, setIsDead] = useState(true)
  const [online, setOnline] = useState(false)
  const [gems, setGems] = useState(0)

  useEffect(() => {
  let cancelled = false
  async function switchMode() {
    phaserGame?.scene.stop('GameScene')
    await socket.disconnect()
    if (cancelled) return
    if (online) {
      socket.connect(ONLINE_SERVER_URL) // gems etc arrive via 'welcome_message'
      socket.onWelcome((id, gems) => {
        if (!cancelled) setGems(gems)
      })
    } else {
      socket.connect(LOCAL_SERVER_URL)
      socket.onWelcome(async (id, gems) => {
        if (cancelled) return
        const g = await loadOfflineGems()
        if (!cancelled) setGems(g)
      })
    }
    phaserGame?.scene.start('GameScene')
  }
  switchMode()
  return () => { cancelled = true }
}, [online])

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
      {screen === 'upgrades' && <UpgradesScreen onBack={() => setScreen('startMenu')} />}
    </div>
  )
}