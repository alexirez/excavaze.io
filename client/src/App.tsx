import { useEffect, useRef, useState } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import GemsOverlay from './components/GemsOverlay'
import StartMenu from './screens/StartMenu'
import GameHud from './screens/GameHud'
import UpgradesScreen from './screens/UpgradesScreen'
import { ServerMessage } from '../../protocol/messages'
import { socket, addSocketListener, ONLINE_SERVER_URL, LOCAL_SERVER_URL } from './network/socket'
import { loadOfflineGems, saveOfflineGems, loadOfflineUpgrades, saveOfflineUpgrades, loadGuestToken } from '../storage/offlineStorage'
import { UPGRADE_NODES } from '../../protocol/data/upgrade-nodes'
import { PLAYER_BASE_HP, PLAYER_BASE_RADIUS } from '../../protocol/constants'
import { clientPlayers } from './clientState'
import { pickRandomColorCombo, numToHex } from '../../protocol/data/colors'
import { DisplayQuest } from './entities'
import { QUEST_TEMPLATE_MAP } from '../../protocol/data/quests'

type Screen = 'startMenu' | 'game' | 'upgrades'

export default function App() {
  const [screen, setScreen] = useState<Screen>('startMenu')
  const [playerName, setPlayerName] = useState('Player')
  const [isDead, setIsDead] = useState(true)
  const [online, setOnline] = useState(false)
  const [gems, setGems] = useState(0)
  const [purchasedUpgrades, setPurchasedUpgrades] = useState<string[]>([])
  const [quests, setQuests] = useState<DisplayQuest[]>([])
  const [{ bodyColor: initialBody, borderColor: initialBorder }] = useState(() => pickRandomColorCombo())
  const [bodyColor, setBodyColor] = useState(numToHex(initialBody))
  const [borderColor, setBorderColor] = useState(numToHex(initialBorder))
  const pendingPurchases = useRef<Map<string, { resolve: (success: boolean) => void, timeout: ReturnType<typeof setTimeout> }>>(new Map())

  useEffect(() => {
    const unsubscribe = addSocketListener((event) => {
      const msg = JSON.parse(event.data) as ServerMessage
      if (msg.type === 'purchase_result') {
        setGems(msg.gems)
        setPurchasedUpgrades(msg.purchasedUpgrades)
        const pending = pendingPurchases.current.get(msg.nodeId)
        if (pending) {
          clearTimeout(pending.timeout)
          pending.resolve(msg.success)
          pendingPurchases.current.delete(msg.nodeId)
        }
      } else if (msg.type === 'player_quests') {
        setQuests(msg.quests)
      } else if (msg.type === 'quest_completed') {
        setQuests(prev => prev.map(q => {
          if (q.instanceId !== msg.instanceId) return q
          const template = QUEST_TEMPLATE_MAP.get(q.questId)
          return template ? { ...q, progress: template.target } : q
        }))
      } else if (msg.type === 'quest_claimed') {
        if (!msg.success) return
        if (typeof msg.gems === 'number') setGems(msg.gems)
        setQuests(prev => {
          const remaining = prev.filter(q => q.instanceId !== msg.instanceId)
          if (msg.promotedInstanceId && msg.promotedQuestId) {
            remaining.push({ instanceId: msg.promotedInstanceId, questId: msg.promotedQuestId, status: 'active', progress: 0 })
          }
          return remaining
        })
      } else if (msg.type === 'quest_progress') {
        setQuests(prev => prev.map(q => q.instanceId === msg.instanceId ? { ...q, progress: msg.progress } : q))
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    console.log('[App] useEffect ran, online =', online)
    let cancelled = false
    async function switchMode() {
      phaserGame?.scene.stop('GameScene')
      await socket.disconnect()
      clearPendingPurchases()
      if (cancelled) return

      socket.connect(online ? ONLINE_SERVER_URL : LOCAL_SERVER_URL)
      socket.onceOpen(() => {
        loadGuestToken().then(token => {
          if (!cancelled) socket.send(JSON.stringify({ type: 'guest_login', token }))
        })
      })

      if (online) {
        socket.onWelcome((id, gems, upgrades) => {
          clientPlayers.set(id, {
          id,
          name: '',
          bodyColor: parseInt(bodyColor.slice(1), 16),
          borderColor: parseInt(borderColor.slice(1), 16),
          xpMultiplier: 1,
          maxLevel: 7,
          maxHp: PLAYER_BASE_HP,
          hpRegenPerSec: 0,
          moveSpeedMultiplier: 1,
          radius: PLAYER_BASE_RADIUS,
          collectedPerks: [],
          drillType: 0,
          drillDmgMultiplier: 1,
          drillLengthMultiplier: 1,
          snapshot: { id, xp: 0, alive: false, shieldActive: false, x: 0, y: 0, rotation: 0, hp: 0 }
        })
        phaserGame?.scene.start('GameScene')
          if (!cancelled) {
            setGems(gems) 
            setPurchasedUpgrades(upgrades ?? [])
          }
        })
      } else {
        socket.onWelcome((id, gems, upgrades) => {
          clientPlayers.set(id, {
            id,
            name: '',
            bodyColor: parseInt(bodyColor.slice(1), 16),
            borderColor: parseInt(borderColor.slice(1), 16),
            xpMultiplier: 1,
            maxLevel: 7,
            maxHp: PLAYER_BASE_HP,
            hpRegenPerSec: 0,
            moveSpeedMultiplier: 1,
            radius: PLAYER_BASE_RADIUS,
            collectedPerks: [],
            drillType: 0,
            drillDmgMultiplier: 1,
            drillLengthMultiplier: 1,
            snapshot: { id, xp: 0, alive: false, shieldActive: false, x: 0, y: 0, rotation: 0, hp: 0 }
          })
        })
        phaserGame?.scene.start('GameScene')
        const [gems, upgrades] = await Promise.all([
            loadOfflineGems(),
            loadOfflineUpgrades(),
          ])
        if (!cancelled) {
        setGems(gems)
        setPurchasedUpgrades(upgrades ?? [])
        }
      }
    }
    switchMode()
    return () => { cancelled = true }
  }, [online])

  async function handlePurchaseUpgrade(nodeId: string): Promise<boolean> {
    if (online) {
      return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        pendingPurchases.current.delete(nodeId)
        resolve(false)
      }, 5000)
      pendingPurchases.current.set(nodeId, { resolve, timeout })
      socket.send(JSON.stringify({ type: 'try_purchase_upgrade', nodeId }))
    })
    }

    const node = UPGRADE_NODES.get(nodeId)
    if (!node) return false
    if (purchasedUpgrades.includes(nodeId)) return false
    if (!node.parents.every(pid => purchasedUpgrades.includes(pid))) return false

    for (const cost of node.cost) {
      if (cost.currency === 'gem' && gems < cost.amount) return false
    }

    const gemCost = node.cost.find(c => c.currency === 'gem')?.amount ?? 0
    const newGems = gems - gemCost
    const newUpgrades = [...purchasedUpgrades, nodeId]

    socket.send(JSON.stringify({ type: 'try_purchase_upgrade', nodeId }))
    setGems(newGems)
    setPurchasedUpgrades(newUpgrades)
    await saveOfflineGems(newGems)
    await saveOfflineUpgrades(newUpgrades)
    return true
  }

  function clearPendingPurchases() {
    for (const { resolve, timeout } of pendingPurchases.current.values()) {
      clearTimeout(timeout)
      resolve(false)
    }
    pendingPurchases.current.clear()
  }

  function handleClaimQuest(instanceId: string) {
    socket.send(JSON.stringify({ type: 'claim_quest', instanceId }))
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />
      <GemsOverlay />
      <GameHud
        screen={screen}
        playerName={playerName}
        isDead={isDead}
        purchasedUpgrades={purchasedUpgrades}
        quests={quests}
        bodyColor={bodyColor}
        setBodyColor={setBodyColor}
        borderColor={borderColor}
        setBorderColor={setBorderColor}
        setIsDead={setIsDead}
        onHome={() => setScreen('startMenu')}
        onUpgrades={() => setScreen('upgrades')}
        onRespawn={() => setScreen('game')}
        onClaimQuest={handleClaimQuest}
      />
      {screen === 'startMenu' && (
      <StartMenu 
        online={online}
        setOnline={setOnline}
        gems={gems}
        bodyColor={bodyColor}
        setBodyColor={setBodyColor}
        borderColor={borderColor}
        setBorderColor={setBorderColor}
        onPlay={(name, bodyColorNum, borderColorNum) => {
          setPlayerName(name)
          setIsDead(false)
          setScreen('game')
          socket.send(JSON.stringify({
            type: 'client_respawn', name, upgrades: purchasedUpgrades, 
            bodyColor: bodyColorNum, borderColor: borderColorNum
          }))
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