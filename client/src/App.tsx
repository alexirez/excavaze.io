import { useEffect, useState } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'
import { socket, ONLINE_SERVER_URL, LOCAL_SERVER_URL } from './network/socket'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('startMenu')
  const [playerName, setPlayerName] = useState('Player')
  const [isDead, setIsDead] = useState(true)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function switchMode() {
      phaserGame?.scene.stop('GameScene')
      await socket.disconnect()
      if (cancelled) return // user toggled again while socket was closing
      socket.connect(online ? ONLINE_SERVER_URL : LOCAL_SERVER_URL)
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