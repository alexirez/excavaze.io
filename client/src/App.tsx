import { useState } from 'react'
import PhaserGame from './core/PhaserGame'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'
import socket from './network/socket'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('startMenu')
  const [playerName, setPlayerName] = useState('Player')
  const [isDead, setIsDead] = useState(true)
  const [online, setOnline] = useState(false) // TODO: set to true once online mode is working

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