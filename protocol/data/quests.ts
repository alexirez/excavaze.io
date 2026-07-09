export interface QuestTemplate {
  id: string
  description: string
  target: number
  event: 'kill_square' | 'kill_player' | 'survive_duration' | 'reach_xp'
  rewardGems: number
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'destroy_5_squares', description: 'Destroy 5 squares', target: 5, event: 'kill_square', rewardGems: 15 },
  { id: 'destroy_10_squares', description: 'Destroy 10 squares', target: 10, event: 'kill_square', rewardGems: 30 },
  { id: 'destroy_25_squares', description: 'Destroy 25 squares', target: 25, event: 'kill_square', rewardGems: 80 },
  { id: 'kill_1_player', description: 'Kill 1 player', target: 1, event: 'kill_player', rewardGems: 110 },
  { id: 'kill_2_players', description: 'Kill 2 players', target: 2, event: 'kill_player', rewardGems: 140 },
  { id: 'kill_3_players', description: 'Kill 3 players', target: 3, event: 'kill_player', rewardGems: 160 },
  { id: 'kill_8_players', description: 'Kill 8 players', target: 8, event: 'kill_player', rewardGems: 400 },
  { id: 'survive_40_sec', description: 'Survive for 40 seconds', target: 40, event: 'survive_duration', rewardGems: 40 },
  { id: 'survive_90_sec', description: 'Survive for 90 seconds', target: 90, event: 'survive_duration', rewardGems: 110 },
  { id: 'reach_10000_xp', description: 'Reach 10,000 xp', target: 10000, event: 'reach_xp', rewardGems: 120 },
  { id: 'reach_40000_xp', description: 'Reach 40,000 xp', target: 40000, event: 'reach_xp', rewardGems: 480 },
]

export const QUEST_TEMPLATE_MAP = new Map(QUEST_TEMPLATES.map(q => [q.id, q]))