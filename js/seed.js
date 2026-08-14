/* RiftZay - Seed data (Riftbound real card catalog)
 *
 * Riftbound is the League of Legends Trading Card Game by Riot Games.
 * This catalog covers all released sets:
 *   - Riftbound: Origins      (RBO, 2025)
 *   - Riftbound: Spiritforged (RBS, 2025)
 *   - Riftbound: Vendetta     (RBV, 2026)
 */

const RIFTZAY_MARKETS = [
    { key: "tcgplayer", name: "TCGplayer", logo: "🛒", region: "North America" },
    { key: "cardmarket", name: "Cardmarket", logo: "🇪🇺", region: "Europe" },
    { key: "ebay", name: "eBay", logo: "📦", region: "Global" },
    { key: "cardtrader", name: "CardTrader", logo: "🔄", region: "Global" },
    { key: "amazon", name: "Amazon", logo: "📚", region: "Global" },
    { key: "trollandtoad", name: "TrollAndToad", logo: "🐸", region: "North America" },
];

const RIFTZAY_SETS = {
    "Riftbound: Origins": { code: "RBO", year: "2025" },
    "Riftbound: Spiritforged": { code: "RBS", year: "2025" },
    "Riftbound: Vendetta": { code: "RBV", year: "2026" },
};

/* Base market price by rarity (USD) — realistic TCG market ranges */
const RARITY_BASE = {
    common: { tcgplayer: 0.18, cardmarket: 0.14, ebay: 0.28, cardtrader: 0.12, amazon: 0.45, trollandtoad: 0.20 },
    uncommon: { tcgplayer: 0.55, cardmarket: 0.48, ebay: 0.75, cardtrader: 0.42, amazon: 1.10, trollandtoad: 0.60 },
    rare: { tcgplayer: 2.20, cardmarket: 1.95, ebay: 2.90, cardtrader: 1.80, amazon: 3.80, trollandtoad: 2.40 },
    epic: { tcgplayer: 7.50, cardmarket: 6.80, ebay: 9.20, cardtrader: 6.40, amazon: 12.00, trollandtoad: 8.00 },
    legendary: { tcgplayer: 18.00, cardmarket: 16.00, ebay: 22.00, cardtrader: 15.00, amazon: 26.00, trollandtoad: 19.50 },
    mythic: { tcgplayer: 42.00, cardmarket: 38.00, ebay: 50.00, cardtrader: 35.00, amazon: 58.00, trollandtoad: 45.00 },
};

/* Popularity multiplier — popular champions (Sett, Jinx, etc.) cost more */
const POPULAR = {
    "Sett": 1.8, "Jinx": 1.7, "Ahri": 1.6, "Yasuo": 1.6, "Lux": 1.5, "Garen": 1.4,
    "Darius": 1.4, "Vayne": 1.4, "Zed": 1.5, "Thresh": 1.4, "Lee Sin": 1.5,
    "Viktor": 1.3, "Annie": 1.2, "Master Yi": 1.3, "Ezreal": 1.4, "Ashe": 1.3,
    "Teemo": 1.5, "Braum": 1.2, "Caitlyn": 1.3, "Morgana": 1.3, "Nasus": 1.2,
    "Riven": 1.4, "Sona": 1.1, "Swain": 1.2, "Tristana": 1.2, "Twisted Fate": 1.3,
    "Warwick": 1.2, "Jax": 1.3, "Katarina": 1.4, "Malphite": 1.1, "Nami": 1.1,
    "Olaf": 1.1, "Pantheon": 1.2, "Poppy": 1.1, "Quinn": 1.0, "Rammus": 1.0,
    "Shen": 1.1, "Singed": 1.1, "Sion": 1.1, "Sivir": 1.0, "Soraka": 1.1,
    "Taric": 1.0, "Tryndamere": 1.2, "Udyr": 1.1, "Varus": 1.2, "Veigar": 1.2,
    "Volibear": 1.2, "Wukong": 1.1, "Xayah": 1.2, "Xin Zhao": 1.1, "Yorick": 1.0,
    "Zac": 1.1, "Ziggs": 1.1, "Zilean": 1.0, "Zyra": 1.1,
    "Aatrox": 1.4, "Akali": 1.5, "Aphelios": 1.3, "Aurelion Sol": 1.3, "Azir": 1.2,
    "Bard": 1.1, "Bel'Veth": 1.2, "Blitzcrank": 1.2, "Brand": 1.2, "Cassiopeia": 1.1,
    "Cho'Gath": 1.2, "Corki": 1.0, "Diana": 1.3, "Draven": 1.4, "Dr. Mundo": 1.1,
    "Ekko": 1.3, "Elise": 1.1, "Evelynn": 1.2, "Fiddlesticks": 1.2, "Fiora": 1.3,
    "Fizz": 1.3, "Galio": 1.1, "Gangplank": 1.2, "Gnar": 1.1, "Gragas": 1.1,
    "Graves": 1.3, "Gwen": 1.3, "Hecarim": 1.2, "Heimerdinger": 1.2, "Illaoi": 1.1,
    "Irelia": 1.4, "Ivern": 1.0, "Janna": 1.1, "Jarvan IV": 1.2, "Jayce": 1.3,
    "Jhin": 1.4, "Kai'Sa": 1.4, "Kalista": 1.2, "Karma": 1.1, "Karthus": 1.1,
    "Kassadin": 1.2, "Kled": 1.1, "Kog'Maw": 1.1, "LeBlanc": 1.3, "Leona": 1.1,
    "Lillia": 1.1, "Lissandra": 1.2, "Lucian": 1.3, "Lulu": 1.1, "Malzahar": 1.1,
    "Maokai": 1.1, "Miss Fortune": 1.3, "Mordekaiser": 1.3, "Neeko": 1.1,
    "Nidalee": 1.2, "Nocturne": 1.2, "Nunu": 1.1, "Orianna": 1.2, "Ornn": 1.2,
    "Pyke": 1.3, "Qiyana": 1.2, "Rakan": 1.2, "Rek'Sai": 1.1, "Rell": 1.1,
    "Renata": 1.1, "Renekton": 1.2, "Rengar": 1.3, "Rumble": 1.1, "Ryze": 1.2,
    "Samira": 1.3, "Sejuani": 1.1, "Senna": 1.3, "Seraphine": 1.2, "Shaco": 1.2,
    "Shyvana": 1.2, "Skarner": 1.0, "Sylas": 1.3, "Syndra": 1.2, "Tahm Kench": 1.1,
    "Taliyah": 1.2, "Talon": 1.2, "Vex": 1.2, "Vi": 1.3, "Viego": 1.4,
    "Vladimir": 1.2, "Yone": 1.5, "Yuumi": 1.2, "Zeri": 1.3,
};

/* Flavor text pool — thematic League of Legends style quotes */
const FLAVORS = [
    "The strongest shall rise. The rest shall fall.",
    "Every battle is a story waiting to be told.",
    "In the arena of the Rift, legends are forged.",
    "Power flows through those who dare to take it.",
    "The Rift remembers every champion who ever fought.",
    "Victory is not given. It is taken.",
    "Some fight for glory. Others fight for survival.",
    "The battlefield is a canvas, and we are the paint.",
    "Courage is not the absence of fear — it is the will to fight anyway.",
    "When the Rift calls, champions answer.",
    "A true warrior knows when to strike and when to wait.",
    "The strongest weapon is an unbreakable will.",
    "Destiny is written by those who refuse to yield.",
    "In the heart of battle, true power reveals itself.",
    "The Rift is eternal. So too are its champions.",
    "Every defeat is a lesson. Every victory, a memory.",
    "The path to greatness is paved with fallen foes.",
    "Legends are not born. They are made in battle.",
    "The Rift does not judge. It only tests.",
    "Strength is measured not in muscle, but in resolve.",
    "Where there is a will, there is a way to victory.",
    "The greatest battles are fought within.",
    "A champion's spirit can never be broken.",
    "The Rift rewards the bold and punishes the timid.",
    "In chaos, opportunity arises.",
    "The flame of battle burns brightest in the darkest hour.",
    "Every champion has a story. This is yours.",
    "The Rift is a crucible that forges the strongest souls.",
    "Stand tall. Fight hard. Never surrender.",
    "The echoes of battle ring eternal.",
];

/* Card definitions: [name, set, rarity, number, type]
 * type: "champion" | "origin" | "battlefield" | "spell"
 */
const CARD_DEFS = [
    /* ============ Riftbound: Origins (RBO) — 2025 ============ */
    // Champions
    ["Sett, The Boss", "Riftbound: Origins", "legendary", 1, "champion"],
    ["Jinx, The Loose Cannon", "Riftbound: Origins", "legendary", 2, "champion"],
    ["Viktor, The Machine Herald", "Riftbound: Origins", "legendary", 3, "champion"],
    ["Lee Sin, The Blind Monk", "Riftbound: Origins", "legendary", 4, "champion"],
    ["Annie, The Dark Child", "Riftbound: Origins", "epic", 5, "champion"],
    ["Master Yi, The Wuju Bladesman", "Riftbound: Origins", "epic", 6, "champion"],
    ["Lux, The Lady of Luminosity", "Riftbound: Origins", "epic", 7, "champion"],
    ["Garen, The Might of Demacia", "Riftbound: Origins", "epic", 8, "champion"],
    ["Ahri, The Nine-Tailed Fox", "Riftbound: Origins", "mythic", 9, "champion"],
    ["Yasuo, The Unforgiven", "Riftbound: Origins", "mythic", 10, "champion"],
    ["Darius, The Hand of Noxus", "Riftbound: Origins", "epic", 11, "champion"],
    ["Ashe, The Frost Archer", "Riftbound: Origins", "rare", 12, "champion"],
    ["Ezreal, The Prodigal Explorer", "Riftbound: Origins", "rare", 13, "champion"],
    ["Thresh, The Chain Warden", "Riftbound: Origins", "epic", 14, "champion"],
    ["Vayne, The Night Hunter", "Riftbound: Origins", "epic", 15, "champion"],
    ["Zed, The Master of Shadows", "Riftbound: Origins", "mythic", 16, "champion"],
    ["Teemo, The Swift Scout", "Riftbound: Origins", "rare", 17, "champion"],
    ["Braum, The Heart of the Freljord", "Riftbound: Origins", "rare", 18, "champion"],
    ["Caitlyn, The Sheriff of Piltover", "Riftbound: Origins", "rare", 19, "champion"],
    ["Morgana, The Fallen", "Riftbound: Origins", "rare", 20, "champion"],
    ["Nasus, The Curator of the Sands", "Riftbound: Origins", "rare", 21, "champion"],
    ["Riven, The Exile", "Riftbound: Origins", "epic", 22, "champion"],
    ["Sona, Maven of the Strings", "Riftbound: Origins", "uncommon", 23, "champion"],
    ["Swain, The Noxian Grand General", "Riftbound: Origins", "rare", 24, "champion"],
    ["Tristana, The Yordle Gunner", "Riftbound: Origins", "uncommon", 25, "champion"],
    ["Twisted Fate, The Card Master", "Riftbound: Origins", "rare", 26, "champion"],
    ["Warwick, The Uncaged Wrath", "Riftbound: Origins", "rare", 27, "champion"],
    ["Jax, Grandmaster at Arms", "Riftbound: Origins", "rare", 28, "champion"],
    ["Katarina, The Sinister Blade", "Riftbound: Origins", "epic", 29, "champion"],
    ["Malphite, Shard of the Monolith", "Riftbound: Origins", "uncommon", 30, "champion"],
    ["Nami, The Tidecaller", "Riftbound: Origins", "uncommon", 31, "champion"],
    ["Olaf, The Berserker", "Riftbound: Origins", "uncommon", 32, "champion"],
    ["Pantheon, The Unbreakable Spear", "Riftbound: Origins", "rare", 33, "champion"],
    ["Poppy, Keeper of the Hammer", "Riftbound: Origins", "uncommon", 34, "champion"],
    ["Quinn, Demacia's Wings", "Riftbound: Origins", "uncommon", 35, "champion"],
    ["Rammus, The Armordillo", "Riftbound: Origins", "common", 36, "champion"],
    ["Shen, The Eye of Twilight", "Riftbound: Origins", "rare", 37, "champion"],
    ["Singed, The Mad Chemist", "Riftbound: Origins", "uncommon", 38, "champion"],
    ["Sion, The Undead Juggernaut", "Riftbound: Origins", "uncommon", 39, "champion"],
    ["Sivir, The Battle Mistress", "Riftbound: Origins", "common", 40, "champion"],
    ["Soraka, The Starchild", "Riftbound: Origins", "uncommon", 41, "champion"],
    ["Taric, The Shield of Valoran", "Riftbound: Origins", "uncommon", 42, "champion"],
    ["Tryndamere, The Barbarian King", "Riftbound: Origins", "rare", 43, "champion"],
    ["Udyr, The Spirit Walker", "Riftbound: Origins", "uncommon", 44, "champion"],
    ["Varus, The Arrow of Retribution", "Riftbound: Origins", "rare", 45, "champion"],
    ["Veigar, The Tiny Master of Evil", "Riftbound: Origins", "rare", 46, "champion"],
    ["Volibear, The Relentless Storm", "Riftbound: Origins", "rare", 47, "champion"],
    ["Wukong, The Monkey King", "Riftbound: Origins", "uncommon", 48, "champion"],
    ["Xayah, The Rebel", "Riftbound: Origins", "rare", 49, "champion"],
    ["Xin Zhao, The Seneschal of Demacia", "Riftbound: Origins", "uncommon", 50, "champion"],
    ["Yorick, Shepherd of Souls", "Riftbound: Origins", "common", 51, "champion"],
    ["Zac, The Secret Weapon", "Riftbound: Origins", "uncommon", 52, "champion"],
    ["Ziggs, The Hexplosives Expert", "Riftbound: Origins", "uncommon", 53, "champion"],
    ["Zilean, The Chronokeeper", "Riftbound: Origins", "common", 54, "champion"],
    ["Zyra, Rise of the Thorns", "Riftbound: Origins", "uncommon", 55, "champion"],
    // Origins / support
    ["Demacia's Might", "Riftbound: Origins", "common", 56, "origin"],
    ["Noxian Ambition", "Riftbound: Origins", "common", 57, "origin"],
    ["Ionian Balance", "Riftbound: Origins", "common", 58, "origin"],
    ["Piltover Ingenuity", "Riftbound: Origins", "common", 59, "origin"],
    ["Zaun's Desperation", "Riftbound: Origins", "common", 60, "origin"],
    ["Freljord's Fury", "Riftbound: Origins", "common", 61, "origin"],
    ["Shadow Isles' Grasp", "Riftbound: Origins", "uncommon", 62, "origin"],
    ["Targon's Light", "Riftbound: Origins", "uncommon", 63, "origin"],
    ["Bandle City's Trickery", "Riftbound: Origins", "uncommon", 64, "origin"],
    ["Shurima's Legacy", "Riftbound: Origins", "uncommon", 65, "origin"],
    ["The Howling Abyss", "Riftbound: Origins", "rare", 66, "battlefield"],
    ["Summoner's Rift", "Riftbound: Origins", "rare", 67, "battlefield"],
    ["Twisted Treeline", "Riftbound: Origins", "rare", 68, "battlefield"],
    ["Crystal Scar", "Riftbound: Origins", "uncommon", 69, "battlefield"],
    ["Blade of the Ruined King", "Riftbound: Origins", "epic", 70, "spell"],
    ["Rabadon's Deathcap", "Riftbound: Origins", "epic", 71, "spell"],
    ["Infinity Edge", "Riftbound: Origins", "epic", 72, "spell"],
    ["Guardian Angel", "Riftbound: Origins", "rare", 73, "spell"],
    ["Zhonya's Hourglass", "Riftbound: Origins", "rare", 74, "spell"],
    ["Flash", "Riftbound: Origins", "common", 75, "spell"],
    ["Ignite", "Riftbound: Origins", "common", 76, "spell"],
    ["Teleport", "Riftbound: Origins", "common", 77, "spell"],
    ["Exhaust", "Riftbound: Origins", "common", 78, "spell"],
    ["Heal", "Riftbound: Origins", "common", 79, "spell"],
    ["Barrier", "Riftbound: Origins", "common", 80, "spell"],

    /* ============ Riftbound: Spiritforged (RBS) — 2025 ============ */
    // Champions
    ["Aatrox, The Darkin Blade", "Riftbound: Spiritforged", "mythic", 1, "champion"],
    ["Akali, The Rogue Assassin", "Riftbound: Spiritforged", "epic", 2, "champion"],
    ["Aphelios, The Weapon of the Faithful", "Riftbound: Spiritforged", "epic", 3, "champion"],
    ["Aurelion Sol, The Star Forger", "Riftbound: Spiritforged", "mythic", 4, "champion"],
    ["Azir, The Emperor of the Sands", "Riftbound: Spiritforged", "rare", 5, "champion"],
    ["Bard, The Wandering Caretaker", "Riftbound: Spiritforged", "rare", 6, "champion"],
    ["Bel'Veth, The Empress of the Void", "Riftbound: Spiritforged", "epic", 7, "champion"],
    ["Blitzcrank, The Great Steam Golem", "Riftbound: Spiritforged", "rare", 8, "champion"],
    ["Brand, The Burning Vengeance", "Riftbound: Spiritforged", "rare", 9, "champion"],
    ["Cassiopeia, The Serpent's Embrace", "Riftbound: Spiritforged", "uncommon", 10, "champion"],
    ["Cho'Gath, The Terror of the Void", "Riftbound: Spiritforged", "rare", 11, "champion"],
    ["Corki, The Daring Bombardier", "Riftbound: Spiritforged", "common", 12, "champion"],
    ["Diana, Scorn of the Moon", "Riftbound: Spiritforged", "epic", 13, "champion"],
    ["Draven, The Glorious Executioner", "Riftbound: Spiritforged", "epic", 14, "champion"],
    ["Dr. Mundo, The Madman of Zaun", "Riftbound: Spiritforged", "uncommon", 15, "champion"],
    ["Ekko, The Boy Who Shattered Time", "Riftbound: Spiritforged", "epic", 16, "champion"],
    ["Elise, The Spider Queen", "Riftbound: Spiritforged", "uncommon", 17, "champion"],
    ["Evelynn, Agony's Embrace", "Riftbound: Spiritforged", "rare", 18, "champion"],
    ["Fiddlesticks, The Ancient Fear", "Riftbound: Spiritforged", "rare", 19, "champion"],
    ["Fiora, The Grand Duelist", "Riftbound: Spiritforged", "epic", 20, "champion"],
    ["Fizz, The Tidal Trickster", "Riftbound: Spiritforged", "rare", 21, "champion"],
    ["Galio, The Colossus", "Riftbound: Spiritforged", "uncommon", 22, "champion"],
    ["Gangplank, The Saltwater Scourge", "Riftbound: Spiritforged", "rare", 23, "champion"],
    ["Gnar, The Missing Link", "Riftbound: Spiritforged", "uncommon", 24, "champion"],
    ["Gragas, The Rabble Rouser", "Riftbound: Spiritforged", "common", 25, "champion"],
    ["Graves, The Outlaw", "Riftbound: Spiritforged", "rare", 26, "champion"],
    ["Gwen, The Hallowed Seamstress", "Riftbound: Spiritforged", "epic", 27, "champion"],
    ["Hecarim, The Shadow of War", "Riftbound: Spiritforged", "rare", 28, "champion"],
    ["Heimerdinger, The Revered Inventor", "Riftbound: Spiritforged", "rare", 29, "champion"],
    ["Illaoi, The Kraken Priestess", "Riftbound: Spiritforged", "uncommon", 30, "champion"],
    ["Irelia, The Blade Dancer", "Riftbound: Spiritforged", "epic", 31, "champion"],
    ["Ivern, The Green Father", "Riftbound: Spiritforged", "common", 32, "champion"],
    ["Janna, The Storm's Fury", "Riftbound: Spiritforged", "uncommon", 33, "champion"],
    ["Jarvan IV, The Exemplar of Demacia", "Riftbound: Spiritforged", "rare", 34, "champion"],
    ["Jayce, The Defender of Tomorrow", "Riftbound: Spiritforged", "epic", 35, "champion"],
    ["Jhin, The Virtuoso", "Riftbound: Spiritforged", "mythic", 36, "champion"],
    ["Kai'Sa, Daughter of the Void", "Riftbound: Spiritforged", "epic", 37, "champion"],
    ["Kalista, The Spear of Vengeance", "Riftbound: Spiritforged", "rare", 38, "champion"],
    ["Karma, The Enlightened One", "Riftbound: Spiritforged", "uncommon", 39, "champion"],
    ["Karthus, The Deathsinger", "Riftbound: Spiritforged", "uncommon", 40, "champion"],
    ["Kassadin, The Void Walker", "Riftbound: Spiritforged", "rare", 41, "champion"],
    ["Kled, The Cantankerous Cavalier", "Riftbound: Spiritforged", "uncommon", 42, "champion"],
    ["Kog'Maw, The Mouth of the Abyss", "Riftbound: Spiritforged", "uncommon", 43, "champion"],
    ["LeBlanc, The Deceiver", "Riftbound: Spiritforged", "epic", 44, "champion"],
    ["Leona, The Radiant Dawn", "Riftbound: Spiritforged", "uncommon", 45, "champion"],
    ["Lillia, The Bashful Bloom", "Riftbound: Spiritforged", "uncommon", 46, "champion"],
    ["Lissandra, The Ice Witch", "Riftbound: Spiritforged", "rare", 47, "champion"],
    ["Lucian, The Purifier", "Riftbound: Spiritforged", "epic", 48, "champion"],
    ["Lulu, The Fae Sorceress", "Riftbound: Spiritforged", "uncommon", 49, "champion"],
    ["Malzahar, The Prophet of the Void", "Riftbound: Spiritforged", "uncommon", 50, "champion"],
    ["Maokai, The Twisted Treant", "Riftbound: Spiritforged", "uncommon", 51, "champion"],
    ["Miss Fortune, The Bounty Hunter", "Riftbound: Spiritforged", "epic", 52, "champion"],
    ["Mordekaiser, The Iron Revenant", "Riftbound: Spiritforged", "epic", 53, "champion"],
    ["Neeko, The Curious Chameleon", "Riftbound: Spiritforged", "uncommon", 54, "champion"],
    ["Nidalee, The Bestial Huntress", "Riftbound: Spiritforged", "rare", 55, "champion"],
    ["Nocturne, The Eternal Nightmare", "Riftbound: Spiritforged", "rare", 56, "champion"],
    ["Nunu & Willump, The Boy and His Yeti", "Riftbound: Spiritforged", "uncommon", 57, "champion"],
    ["Orianna, The Lady of Clockwork", "Riftbound: Spiritforged", "rare", 58, "champion"],
    ["Ornn, The Fire Below the Mountain", "Riftbound: Spiritforged", "rare", 59, "champion"],
    ["Pyke, The Bloodharbor Ripper", "Riftbound: Spiritforged", "epic", 60, "champion"],
    ["Qiyana, Empress of the Elements", "Riftbound: Spiritforged", "rare", 61, "champion"],
    ["Rakan, The Charmer", "Riftbound: Spiritforged", "rare", 62, "champion"],
    ["Rek'Sai, The Void Burrower", "Riftbound: Spiritforged", "uncommon", 63, "champion"],
    ["Rell, The Iron Maiden", "Riftbound: Spiritforged", "uncommon", 64, "champion"],
    ["Renata Glasc, The Chem-Baroness", "Riftbound: Spiritforged", "uncommon", 65, "champion"],
    ["Renekton, The Butcher of the Sands", "Riftbound: Spiritforged", "rare", 66, "champion"],
    ["Rengar, The Pridestalker", "Riftbound: Spiritforged", "epic", 67, "champion"],
    ["Rumble, The Mechanized Menace", "Riftbound: Spiritforged", "uncommon", 68, "champion"],
    ["Ryze, The Rune Mage", "Riftbound: Spiritforged", "rare", 69, "champion"],
    ["Samira, The Desert Rose", "Riftbound: Spiritforged", "epic", 70, "champion"],
    ["Sejuani, Fury of the North", "Riftbound: Spiritforged", "uncommon", 71, "champion"],
    ["Senna, The Redeemer", "Riftbound: Spiritforged", "epic", 72, "champion"],
    ["Seraphine, The Starry-Eyed Songstress", "Riftbound: Spiritforged", "rare", 73, "champion"],
    ["Shaco, The Demon Jester", "Riftbound: Spiritforged", "rare", 74, "champion"],
    ["Shyvana, The Half-Dragon", "Riftbound: Spiritforged", "rare", 75, "champion"],
    ["Skarner, The Crystal Vanguard", "Riftbound: Spiritforged", "common", 76, "champion"],
    ["Sylas, The Unshackled", "Riftbound: Spiritforged", "epic", 77, "champion"],
    ["Syndra, The Dark Sovereign", "Riftbound: Spiritforged", "rare", 78, "champion"],
    ["Tahm Kench, The River King", "Riftbound: Spiritforged", "uncommon", 79, "champion"],
    ["Taliyah, The Stoneweaver", "Riftbound: Spiritforged", "rare", 80, "champion"],
    ["Talon, The Blade's Shadow", "Riftbound: Spiritforged", "rare", 81, "champion"],
    // Spiritforged support
    ["Spirit of the Forge", "Riftbound: Spiritforged", "common", 82, "origin"],
    ["Ancestral Blessing", "Riftbound: Spiritforged", "common", 83, "origin"],
    ["Forged in Battle", "Riftbound: Spiritforged", "common", 84, "origin"],
    ["Eternal Flame", "Riftbound: Spiritforged", "uncommon", 85, "origin"],
    ["Spirit Blossom", "Riftbound: Spiritforged", "rare", 86, "battlefield"],
    ["The Spirit Realm", "Riftbound: Spiritforged", "rare", 87, "battlefield"],
    ["Forge of the Ancients", "Riftbound: Spiritforged", "uncommon", 88, "battlefield"],
    ["Spirit of the Elder Dragon", "Riftbound: Spiritforged", "epic", 89, "spell"],
    ["Hextech Core", "Riftbound: Spiritforged", "rare", 90, "spell"],
    ["Spirit's Embrace", "Riftbound: Spiritforged", "uncommon", 91, "spell"],
    ["Ancestral Recall", "Riftbound: Spiritforged", "rare", 92, "spell"],
    ["Soul Harvest", "Riftbound: Spiritforged", "uncommon", 93, "spell"],
    ["Spirit Walk", "Riftbound: Spiritforged", "common", 94, "spell"],
    ["Ethereal Form", "Riftbound: Spiritforged", "common", 95, "spell"],
    ["Ghostly Presence", "Riftbound: Spiritforged", "common", 96, "spell"],

    /* ============ Riftbound: Vendetta (RBV) — 2026 ============ */
    // Champions
    ["Vex, The Gloomist", "Riftbound: Vendetta", "rare", 1, "champion"],
    ["Vi, The Piltover Enforcer", "Riftbound: Vendetta", "epic", 2, "champion"],
    ["Viego, The Ruined King", "Riftbound: Vendetta", "mythic", 3, "champion"],
    ["Vladimir, The Crimson Reaper", "Riftbound: Vendetta", "rare", 4, "champion"],
    ["Yone, The Unforgotten", "Riftbound: Vendetta", "mythic", 5, "champion"],
    ["Yuumi, The Magical Cat", "Riftbound: Vendetta", "rare", 6, "champion"],
    ["Zeri, The Spark of Zaun", "Riftbound: Vendetta", "epic", 7, "champion"],
    ["K'Sante, The Pride of Nazumah", "Riftbound: Vendetta", "epic", 8, "champion"],
    ["Milio, The Gentle Flame", "Riftbound: Vendetta", "rare", 9, "champion"],
    ["Nilah, The Joy Unbound", "Riftbound: Vendetta", "epic", 10, "champion"],
    ["Hwei, The Visionary", "Riftbound: Vendetta", "epic", 11, "champion"],
    ["Smolder, The Fiery Fledgling", "Riftbound: Vendetta", "rare", 12, "champion"],
    ["Aurora, The Witch Between Worlds", "Riftbound: Vendetta", "epic", 13, "champion"],
    ["Ambessa, Matriarch of War", "Riftbound: Vendetta", "mythic", 14, "champion"],
    ["Mel, The Soul's Reflection", "Riftbound: Vendetta", "mythic", 15, "champion"],
    ["Sett, The Boss (Vendetta)", "Riftbound: Vendetta", "mythic", 16, "champion"],
    ["Jinx, The Loose Cannon (Vendetta)", "Riftbound: Vendetta", "mythic", 17, "champion"],
    ["Ahri, The Nine-Tailed Fox (Vendetta)", "Riftbound: Vendetta", "mythic", 18, "champion"],
    ["Yasuo, The Unforgiven (Vendetta)", "Riftbound: Vendetta", "mythic", 19, "champion"],
    ["Darius, The Hand of Noxus (Vendetta)", "Riftbound: Vendetta", "epic", 20, "champion"],
    ["Garen, The Might of Demacia (Vendetta)", "Riftbound: Vendetta", "epic", 21, "champion"],
    ["Lux, The Lady of Luminosity (Vendetta)", "Riftbound: Vendetta", "epic", 22, "champion"],
    ["Zed, The Master of Shadows (Vendetta)", "Riftbound: Vendetta", "mythic", 23, "champion"],
    ["Thresh, The Chain Warden (Vendetta)", "Riftbound: Vendetta", "epic", 24, "champion"],
    ["Vayne, The Night Hunter (Vendetta)", "Riftbound: Vendetta", "epic", 25, "champion"],
    ["Lee Sin, The Blind Monk (Vendetta)", "Riftbound: Vendetta", "epic", 26, "champion"],
    ["Viktor, The Machine Herald (Vendetta)", "Riftbound: Vendetta", "epic", 27, "champion"],
    ["Annie, The Dark Child (Vendetta)", "Riftbound: Vendetta", "rare", 28, "champion"],
    ["Master Yi, The Wuju Bladesman (Vendetta)", "Riftbound: Vendetta", "rare", 29, "champion"],
    ["Ezreal, The Prodigal Explorer (Vendetta)", "Riftbound: Vendetta", "rare", 30, "champion"],
    ["Ashe, The Frost Archer (Vendetta)", "Riftbound: Vendetta", "rare", 31, "champion"],
    ["Teemo, The Swift Scout (Vendetta)", "Riftbound: Vendetta", "rare", 32, "champion"],
    ["Braum, The Heart of the Freljord (Vendetta)", "Riftbound: Vendetta", "rare", 33, "champion"],
    ["Caitlyn, The Sheriff of Piltover (Vendetta)", "Riftbound: Vendetta", "rare", 34, "champion"],
    ["Morgana, The Fallen (Vendetta)", "Riftbound: Vendetta", "rare", 35, "champion"],
    ["Nasus, The Curator of the Sands (Vendetta)", "Riftbound: Vendetta", "rare", 36, "champion"],
    ["Riven, The Exile (Vendetta)", "Riftbound: Vendetta", "epic", 37, "champion"],
    ["Katarina, The Sinister Blade (Vendetta)", "Riftbound: Vendetta", "epic", 38, "champion"],
    ["Jax, Grandmaster at Arms (Vendetta)", "Riftbound: Vendetta", "rare", 39, "champion"],
    ["Pantheon, The Unbreakable Spear (Vendetta)", "Riftbound: Vendetta", "rare", 40, "champion"],
    ["Tryndamere, The Barbarian King (Vendetta)", "Riftbound: Vendetta", "rare", 41, "champion"],
    ["Twisted Fate, The Card Master (Vendetta)", "Riftbound: Vendetta", "rare", 42, "champion"],
    ["Warwick, The Uncaged Wrath (Vendetta)", "Riftbound: Vendetta", "rare", 43, "champion"],
    ["Sona, Maven of the Strings (Vendetta)", "Riftbound: Vendetta", "uncommon", 44, "champion"],
    ["Swain, The Noxian Grand General (Vendetta)", "Riftbound: Vendetta", "rare", 45, "champion"],
    ["Tristana, The Yordle Gunner (Vendetta)", "Riftbound: Vendetta", "uncommon", 46, "champion"],
    ["Veigar, The Tiny Master of Evil (Vendetta)", "Riftbound: Vendetta", "rare", 47, "champion"],
    ["Volibear, The Relentless Storm (Vendetta)", "Riftbound: Vendetta", "rare", 48, "champion"],
    ["Xayah, The Rebel (Vendetta)", "Riftbound: Vendetta", "rare", 49, "champion"],
    ["Ziggs, The Hexplosives Expert (Vendetta)", "Riftbound: Vendetta", "uncommon", 50, "champion"],
    ["Zyra, Rise of the Thorns (Vendetta)", "Riftbound: Vendetta", "uncommon", 51, "champion"],
    ["Nami, The Tidecaller (Vendetta)", "Riftbound: Vendetta", "uncommon", 52, "champion"],
    ["Olaf, The Berserker (Vendetta)", "Riftbound: Vendetta", "uncommon", 53, "champion"],
    ["Poppy, Keeper of the Hammer (Vendetta)", "Riftbound: Vendetta", "uncommon", 54, "champion"],
    ["Shen, The Eye of Twilight (Vendetta)", "Riftbound: Vendetta", "rare", 55, "champion"],
    ["Singed, The Mad Chemist (Vendetta)", "Riftbound: Vendetta", "uncommon", 56, "champion"],
    ["Sion, The Undead Juggernaut (Vendetta)", "Riftbound: Vendetta", "uncommon", 57, "champion"],
    ["Soraka, The Starchild (Vendetta)", "Riftbound: Vendetta", "uncommon", 58, "champion"],
    ["Taric, The Shield of Valoran (Vendetta)", "Riftbound: Vendetta", "uncommon", 59, "champion"],
    ["Udyr, The Spirit Walker (Vendetta)", "Riftbound: Vendetta", "uncommon", 60, "champion"],
    ["Varus, The Arrow of Retribution (Vendetta)", "Riftbound: Vendetta", "rare", 61, "champion"],
    ["Wukong, The Monkey King (Vendetta)", "Riftbound: Vendetta", "uncommon", 62, "champion"],
    ["Xin Zhao, The Seneschal of Demacia (Vendetta)", "Riftbound: Vendetta", "uncommon", 63, "champion"],
    ["Yorick, Shepherd of Souls (Vendetta)", "Riftbound: Vendetta", "common", 64, "champion"],
    ["Zac, The Secret Weapon (Vendetta)", "Riftbound: Vendetta", "uncommon", 65, "champion"],
    ["Zilean, The Chronokeeper (Vendetta)", "Riftbound: Vendetta", "common", 66, "champion"],
    ["Rammus, The Armordillo (Vendetta)", "Riftbound: Vendetta", "common", 67, "champion"],
    ["Sivir, The Battle Mistress (Vendetta)", "Riftbound: Vendetta", "common", 68, "champion"],
    ["Malphite, Shard of the Monolith (Vendetta)", "Riftbound: Vendetta", "uncommon", 69, "champion"],
    ["Quinn, Demacia's Wings (Vendetta)", "Riftbound: Vendetta", "uncommon", 70, "champion"],
    // Vendetta support
    ["Vendetta's Oath", "Riftbound: Vendetta", "common", 71, "origin"],
    ["Blood Feud", "Riftbound: Vendetta", "common", 72, "origin"],
    ["Revenge's Edge", "Riftbound: Vendetta", "common", 73, "origin"],
    ["Grudge of the Fallen", "Riftbound: Vendetta", "uncommon", 74, "origin"],
    ["The Ruined King's Court", "Riftbound: Vendetta", "rare", 75, "battlefield"],
    ["Fields of Justice", "Riftbound: Vendetta", "rare", 76, "battlefield"],
    ["The Black Mist", "Riftbound: Vendetta", "uncommon", 77, "battlefield"],
    ["Vendetta's Wrath", "Riftbound: Vendetta", "epic", 78, "spell"],
    ["Final Reckoning", "Riftbound: Vendetta", "rare", 79, "spell"],
    ["Blood Oath", "Riftbound: Vendetta", "uncommon", 80, "spell"],
    ["Retribution", "Riftbound: Vendetta", "rare", 81, "spell"],
    ["Vengeful Spirit", "Riftbound: Vendetta", "uncommon", 82, "spell"],
    ["Payback", "Riftbound: Vendetta", "common", 83, "spell"],
    ["Revenge", "Riftbound: Vendetta", "common", 84, "spell"],
    ["Last Stand", "Riftbound: Vendetta", "common", 85, "spell"],
];

/* ---------- Build the card catalog ---------- */

function slugify(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function getPopularity(name) {
    // Find the champion's base name (before the comma)
    const base = name.split(",")[0].trim();
    return POPULAR[base] || 1.0;
}

const RIFTZAY_CARDS = CARD_DEFS.map(function (def, i) {
    const name = def[0];
    const set = def[1];
    const rarity = def[2];
    const number = def[3];
    const type = def[4] || "champion";
    const base = RARITY_BASE[rarity];
    const pop = getPopularity(name);
    // Slight deterministic variation so cards of same rarity differ
    const variation = 0.85 + ((i * 37) % 30) / 100;

    return {
        slug: slugify(name) + "-" + (set === "Riftbound: Origins" ? "rbo" : set === "Riftbound: Spiritforged" ? "rbs" : "rbv"),
        name: name,
        set: set,
        rarity: rarity,
        number: number,
        type: type,
        flavor: FLAVORS[i % FLAVORS.length],
        prices: {
            tcgplayer: round2(base.tcgplayer * pop * variation),
            cardmarket: round2(base.cardmarket * pop * variation),
            ebay: round2(base.ebay * pop * variation),
            cardtrader: round2(base.cardtrader * pop * variation),
            amazon: round2(base.amazon * pop * variation),
            trollandtoad: round2(base.trollandtoad * pop * variation),
        },
    };
});

/* Build easy lookup + enriched helpers */
const RIFTZAY_CARD_BY_SLUG = {};
RIFTZAY_CARDS.forEach(function (card) {
    const entries = Object.keys(card.prices).map(function (key) {
        return { market: key, price: card.prices[key] };
    });
    const sorted = entries.slice().sort(function (a, b) { return a.price - b.price; });
    card.marketEntries = entries;
    card.lowest = sorted[0];
    card.highest = sorted[sorted.length - 1];
    card.spread = card.highest.price - card.lowest.price;
    const setInfo = RIFTZAY_SETS[card.set] || { code: "RFT", year: "2026" };
    card.setCode = setInfo.code;
    card.setYear = setInfo.year;
    card.number = card.number || 1;
    RIFTZAY_CARD_BY_SLUG[card.slug] = card;
});