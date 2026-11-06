// The four fictional demo series: what make-series-art.mjs draws and seed-demo-ips.ts publishes.
// A card's name goes on chain for good, so changing one here means a new card.

// File suffix and rarity index for the eight cards of every series, in this order.
export const FILES = [
  ["common", 0], ["common-2", 0], ["common-3", 0], ["common-4", 0],
  ["rare", 1], ["rare-2", 1], ["epic", 2], ["legendary", 3],
];

// Eight cards in the order of FILES: [name, flavor line 1, flavor line 2].
export const SERIES = [
  {
    prefix: "mochi", folder: "Mochi Puffs", sub: "Mochi Puffs", logo: "mochi-logo.png",
    name: "Mochi Puffs (fictional characters)", category: "Characters", username: "mochi_puffs_demo",
    cards: [
      ["Vanilla Puff", "Soft, round, and very sure", "it was your idea to hug it."],
      ["Sprout Puff", "Waters the garden daily.", "Mostly waters itself."],
      ["Cocoa Puff", "Two marshmallows, one scarf,", "and nowhere else to be."],
      ["Bubble Puff", "Fell upward one afternoon.", "Has not asked to come down."],
      ["Berry Puff", "Picked at dawn. Still", "insists it is a vegetable."],
      ["Snow Puff", "Built for one downhill run.", "Has no plan for stopping."],
      ["Moonlit Puff", "Awake only long enough", "to tell the moon goodnight."],
      ["Crown Puff", "Rules a small kingdom of", "cushions, kindly and badly."],
    ],
  },
  {
    prefix: "aika", folder: "Aika Nova", sub: "Aika Nova", logo: "aika-logo.png",
    name: "Aika Nova (fictional virtual streamer)", category: "VTubers", username: "aika_nova_demo",
    cards: [
      ["Morning Stream", "Three viewers and a cold", "coffee. A perfect start."],
      ["Snack Break", "Chat asked about the game.", "She answered with noodles."],
      ["Art Stream", "She promised one quick sketch.", "It is now hour four."],
      ["Rainy Day Chat", "No game, no schedule. Just", "rain and whoever stayed."],
      ["Midnight Stream", "Chat said one more game", "at 2 a.m. Chat was lying."],
      ["Arcade Run", "Beat the high score, then", "thanked the machine."],
      ["Idol Stage", "Every spotlight found her", "before the first note did."],
      ["Galaxy Diva", "The whole sky subscribed.", "She thanked it by name."],
    ],
  },
  {
    prefix: "luma", folder: "Luma Four", sub: "Luma Four", logo: "luma-logo.png",
    name: "Luma Four (fictional boy band)", category: "Entertainers", username: "luma_four_demo",
    cards: [
      ["Kai: Soundcheck", "Kai hears the flat note", "before anyone plays it."],
      ["Theo: Dance Practice", "The mirror gave up trying", "to keep pace with Theo."],
      ["Arlo: Back Row", "Arlo plays to the empty seats", "as if they bought tickets."],
      ["Sami: Tour Bus", "Sami writes every chorus", "somewhere between cities."],
      ["Kai and Theo: Rooftop", "Two sides of one argument,", "and the song won."],
      ["Arlo and Sami: Encore Walk", "One more song, they said.", "Then they said it again."],
      ["First Light", "Four strangers, one stage.", "Nobody left as a stranger."],
      ["Four Lights", "The whole arena sang it back", "before the band could."],
    ],
  },
  {
    prefix: "thornmaw", folder: "Thornmaw Wilds", sub: "Thornmaw Wilds", logo: "Thornmaw-logo.png",
    name: "Thornmaw Wilds (fictional monsters)", category: "Games & stories", username: "thornmaw_wilds_demo",
    cards: [
      ["Mosslug", "Has been crossing this log", "since before the forest."],
      ["Cinder Imp", "Says the fire was already", "like that when it got here."],
      ["Bogwisp", "Lights the way through the bog,", "then hides from the thanks."],
      ["Stoneback Ram", "Has never once gone around", "anything."],
      ["Frostmaw", "Its roar starts the blizzard.", "Its hug ends the argument."],
      ["Reefjaw", "Wears a whole reef on its back", "and still jumps for joy."],
      ["Thornwing", "Its wings stare back.", "Nothing stares twice."],
      ["Ashen Colossus", "The mountain did not erupt.", "It stood up."],
    ],
  },
];
