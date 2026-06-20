import { useState } from 'react'
import PhaserGame from './core/PhaserGame'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('startMenu')
  const [playerName, setPlayerName] = useState('Player')

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />
      <GameHud
        screen={screen}
        onHome={() => setScreen('startMenu')}
        onUpgrades={() => setScreen('upgrades')}
        onRespawn={() => setScreen('game')}
      />
      {screen === 'startMenu' && (
        <StartMenu onPlay={(name) => {
          setPlayerName(name)
          setScreen('game')
        }} />
      )}
      {screen === 'upgrades' && <UpgradesScreen onBack={() => setScreen('game')} />}
    </div>
  )
}