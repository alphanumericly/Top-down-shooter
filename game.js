// Game variables
let canvas, ctx;
let gameRunning = false;
let player = { 
    x: 700, 
    y: 500, 
    radius: 15, 
    speed: 2.2, 
    health: 100, 
    maxHealth: 100,
    damage: 20,
    fireRate: 0.5, // shots per second (slower)
    range: 150, // Initial range for the player
    lastShot: 0,
    damageFlash: 0, // Time remaining for damage flash effect
    damageFlashDuration: 200, // Flash duration in milliseconds
    upgradeLevels: {
        damage: 0,
        fireRate: 0,
        health: 0,
        speed: 0,
        range: 0
    },
    abilities: {}, // Will store ability levels and cooldowns
    activeEffects: [] // Will store active ability effects
};
let bullets = [];
let enemyBullets = [];
let enemies = [];
let score = 0;
let xp = 0;
let level = 1;
let nextLevelXP = 100;
let gameStartTime = 0;
let timeSurvived = 0;
let entityLimit = 20; // Starting limit
let keys = {};
let mouse = { x: 0, y: 0, pressed: false };
let lastSpawn = 0;
let showUpgradeMenu = false;
let upgradeCards = [];
let selectedWeapon = null;
let showWeaponMenu = true;
let visualEffects = []; // Array to store visual effects
let savedGameState = null;

// Kill tracking for berserker rage
let recentKills = [];
let berserkerLastTriggered = 0;

// Simple console logging
function debugLog(message) {
    console.log(message);
}

// Helper function to handle enemy death consistently
function handleEnemyDeath(enemy, enemyIndex = -1) {
    score += enemy.scoreValue || 100;
    xp += enemy.xpValue || 50;
    
    // Remove enemy from array if index provided
    if (enemyIndex >= 0) {
        enemies.splice(enemyIndex, 1);
    }
    
    // Check for level up (only if upgrade menu isn't already open)
    if (xp >= nextLevelXP && !showUpgradeMenu) {
        levelUp();
    }
}

// Helper function to damage enemies along a laser path
function damageLaserPath(startX, startY, endX, endY, laserWidth, damage) {
    const laserLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const laserAngle = Math.atan2(endY - startY, endX - startX);
    
    // Check each enemy to see if it intersects with the laser beam
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        // Calculate perpendicular distance from enemy to laser line
        const dx = enemy.x - startX;
        const dy = enemy.y - startY;
        const projectionLength = dx * Math.cos(laserAngle) + dy * Math.sin(laserAngle);
        
        // Check if enemy is within laser range
        if (projectionLength >= 0 && projectionLength <= laserLength) {
            const perpDistance = Math.abs(-dx * Math.sin(laserAngle) + dy * Math.cos(laserAngle));
            
            // Check if enemy is within laser width
            if (perpDistance <= laserWidth / 2 + enemy.radius) {
                enemy.health -= damage;
                enemy.damageFlash = enemy.damageFlashDuration;
                
                // Add laser hit visual effect
                visualEffects.push({
                    type: 'laserHit',
                    x: enemy.x,
                    y: enemy.y,
                    startTime: Date.now(),
                    endTime: Date.now() + 300,
                    alpha: 0.9
                });
                
                if (enemy.health <= 0) {
                    handleEnemyDeath(enemy, i);
                }
            }
        }
    }
}

// Ability system
const abilityTypes = {
    // Weapon-specific abilities
    weaponSpecific: {
        sword: {
            whirlwind: {
                name: "Whirlwind Strike",
                description: "Periodically unleash a spinning attack hitting all nearby enemies",
                cooldown: 8000, // 8 seconds
                damage: [60, 80, 100], // Damage per level
                range: 100,
                maxLevel: 3
            },
            berserker: {
                name: "Berserker Rage",
                description: "Increases attack speed and damage after kill streaks",
                cooldown: [45000, 40000, 35000], // Cooldown between activations
                duration: [8000, 10000, 12000], // Duration per level  
                damageBonus: [0.6, 0.8, 1.0], // Damage multiplier
                speedBonus: [0.4, 0.6, 0.8], // Fire rate bonus
                killsRequired: [8, 6, 5], // Number of consecutive kills needed to trigger
                maxLevel: 3
            },
            execution: {
                name: "Bloodthirst",
                description: "When surrounded, enter a rage mode where all hits instantly kill",
                cooldown: [25000, 20000, 15000], // Cooldown per level
                duration: 4000, // 4 seconds
                triggerRange: 100, // Detection range for enemies
                enemiesRequired: [10, 8, 6], // Enemies needed to trigger per level
                maxLevel: 3
            }
        },
        bow: {
            multishot: {
                name: "Multi Shot",
                description: "Fire additional arrows in a spread pattern",
                cooldown: 0, // Passive - affects every shot
                extraArrows: [2, 3, 5], // Level 1: +2, Level 2: +3, Level 3: +5
                maxLevel: 3
            },
            piercing: {
                name: "Piercing Arrow",
                description: "Arrows pierce through multiple enemies",
                cooldown: 8000, // 8 seconds
                duration: [8000, 10000, 12000], // How long piercing lasts
                pierceCount: [2, 3, 4], // Max enemies pierced per arrow
                damageReduction: 0.8, // Damage reduction per pierce (20% less)
                maxLevel: 3
            },
            volley: {
                name: "Arrow Volley",
                description: "Rain arrows from the sky in a large area",
                cooldown: 18000, // 18 seconds
                arrowCount: [8, 12, 16], // Arrows per volley
                damage: [20, 30, 40], // Damage per arrow
                radius: [100, 120, 140], // Area radius
                maxLevel: 3
            }
        },
        staff: {
            fireshot: {
                name: "Fire Enchantment",
                description: "Projectiles burn enemies over time",
                cooldown: 0, // Passive - affects projectiles
                burnDamage: [5, 8, 12], // Damage per tick
                burnDuration: 3000, // 3 seconds
                maxLevel: 3
            },
            arcane: {
                name: "Arcane Orb",
                description: "Slow-moving orb that seeks enemies and explodes",
                cooldown: 12000, // 12 seconds
                orbCount: [1, 2, 3], // Number of orbs
                seekRange: 150, // How far orbs seek enemies
                damage: [80, 100, 120], // Explosion damage
                explosionRadius: 60,
                maxLevel: 3
            },
            mana: {
                name: "Mana Surge",
                description: "Temporary unlimited fire rate and extra projectiles",
                cooldown: 25000, // 25 seconds
                duration: [3000, 4000, 5000], // Duration per level
                extraProjectiles: [2, 3, 4], // Extra projectiles per shot
                maxLevel: 3
            }
        },
        cannon: {
            explosive: {
                name: "Explosive Rounds",
                description: "Shots explode on impact, damaging nearby enemies",
                cooldown: 0, // Passive - affects every shot
                explosionRadius: [50, 75, 100],
                explosionDamage: [20, 35, 50],
                maxLevel: 3
            },
            laser: {
                name: "Laser Cannon",
                description: "Fire a devastating laser beam that pierces through all enemies",
                cooldown: 12000, // 12 seconds
                laserCount: [1, 2, 3], // Number of laser beams
                laserDamage: [60, 85, 120], // Damage per laser
                laserWidth: [15, 20, 25], // Width of laser beam
                laserRange: [400, 450, 500], // Range of laser
                maxLevel: 3
            },
            overcharge: {
                name: "Overcharge",
                description: "Next few shots deal massive damage and pierce",
                cooldown: 20000, // 20 seconds
                shotCount: [3, 4, 5], // Number of overcharged shots
                damageMultiplier: [2.0, 2.5, 3.0], // Damage multiplier
                pierceCount: 3, // How many enemies shots pierce
                maxLevel: 3
            }
        }
    },
    // General abilities
    general: {
        shield: {
            name: "Energy Shield",
            description: "Absorb damage for a short duration",
            cooldown: 15000, // 15 seconds
            duration: [3000, 4000, 5000], // Shield duration
            absorption: [50, 75, 100], // Damage absorbed
            maxLevel: 3
        },
        lightning: {
            name: "Chain Lightning",
            description: "Strike enemies with electricity that jumps between targets",
            cooldown: 10000, // 10 seconds (reduced cooldown)
            damage: [25, 45, 70], // Lower base, higher scaling
            chains: [2, 4, 6], // Number of jumps (reduced base)
            range: 150,
            maxLevel: 3
        },
        healing: {
            name: "Regeneration",
            description: "Recover health over time",
            cooldown: 25000, // 25 seconds (longer cooldown)
            duration: [3000, 4000, 5000], // Keep shorter duration
            healPerSecond: [8, 12, 16], // Reduced heal rate
            maxLevel: 3
        },
        timeStop: {
            name: "Time Dilation",
            description: "Slow down all enemies for a short time",
            cooldown: 25000, // 25 seconds
            duration: [2000, 3000, 4000],
            slowFactor: [0.3, 0.2, 0.1], // 70%, 80%, 90% speed reduction
            maxLevel: 3
        },
        frost: {
            name: "Frost Nova",
            description: "Create an expanding ice wave that freezes enemies",
            cooldown: 18000, // 18 seconds
            damage: [15, 25, 40], // Damage dealt
            range: [120, 150, 180], // Expansion radius
            freezeDuration: [1500, 2000, 2500], // How long enemies are frozen
            maxLevel: 3
        },
        vampiric: {
            name: "Vampiric Aura",
            description: "Gain life steal on all attacks for a duration",
            cooldown: 20000, // 20 seconds
            duration: [8000, 10000, 12000], // How long the effect lasts
            lifeSteal: [0.2, 0.3, 0.4], // Percentage of damage returned as health
            maxLevel: 3
        },
        meteor: {
            name: "Meteor Strike",
            description: "Call down meteors that deal massive area damage",
            cooldown: 30000, // 30 seconds
            damage: [80, 120, 180], // Damage per meteor
            meteorCount: [3, 4, 5], // Number of meteors
            explosionRadius: [60, 75, 90], // Explosion radius
            maxLevel: 3
        },
        shockwave: {
            name: "Shockwave",
            description: "Create expanding waves of force that damage all nearby enemies",
            cooldown: 12000, // 12 seconds
            damage: [35, 55, 80], // Damage per wave
            waveCount: [2, 3, 4], // Number of waves
            waveRadius: [80, 100, 120], // Max radius per wave
            waveSpeed: 4, // Pixels per frame expansion
            maxLevel: 3
        },
        spiritBlades: {
            name: "Spirit Blades",
            description: "Summon rotating energy blades that orbit and slice enemies",
            cooldown: 15000, // 15 seconds
            duration: [8000, 10000, 12000], // How long blades last
            bladeCount: [3, 4, 5], // Number of blades
            damage: [25, 40, 60], // Damage per blade hit
            orbitRadius: 60, // Distance from player
            rotationSpeed: 0.08, // Radians per frame
            maxLevel: 3
        }
    }
};

// Weapon types with different stats and behaviors
const weaponTypes = {
    sword: {
        name: "Sword",
        damage: 35,
        fireRate: 1.25, // 1.25 shots per second (0.8s cooldown)
        range: 80,
        projectileSpeed: 12,
        projectileType: "slash",
        color: "#ffffff",
        description: "High damage, short range melee"
    },
    bow: {
        name: "Bow",
        damage: 25,
        fireRate: 1.67, // 1.67 shots per second (0.6s cooldown)
        range: 250,
        projectileSpeed: 10,
        projectileType: "arrow",
        color: "#8B4513",
        description: "Balanced ranged weapon"
    },
    staff: {
        name: "Magic Staff",
        damage: 20,
        fireRate: 0.83, // 0.83 shots per second (1.2s cooldown)
        range: 200,
        projectileSpeed: 8,
        projectileType: "magic",
        color: "#9932CC",
        description: "Fast casting, magical projectiles"
    },
    cannon: {
        name: "Plasma Cannon",
        damage: 45,
        fireRate: 0.5, // 0.5 shots per second - slow but powerful
        range: 300,
        projectileSpeed: 15,
        projectileType: "plasma",
        color: "#00FFFF",
        description: "Slow but devastating energy weapon"
    }
};

// Initialize game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set up event listeners
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        
        // Save/Load hotkeys
        if (e.code === 'KeyS' && gameRunning) {
            saveGameState();
            e.preventDefault();
        }
        if (e.code === 'KeyL') {
            loadGameState();
            e.preventDefault();
        }
        
        // Removed debug logging
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        // Removed debug logging
    });
    
    // Remove space key listener since upgrades are automatic now
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    
    canvas.addEventListener('mousedown', (e) => {
        mouse.pressed = true;
        // Removed debug logging
    });
    
    canvas.addEventListener('mouseup', (e) => {
        mouse.pressed = false;
        // Removed debug logging
    });
    
    console.log('Game initialized');
}

// Simple weapon selection - starts game immediately
function selectWeapon(weaponKey) {
    console.log('Weapon selected:', weaponKey);
    
    // Validate weapon exists
    if (!weaponTypes[weaponKey]) {
        console.error('Invalid weapon:', weaponKey);
        alert('Invalid weapon selection. Please try again.');
        return;
    }
    
    selectedWeapon = weaponKey;
    
    // Start the game immediately
    startGame();
}

// Make it globally accessible immediately
window.selectWeapon = selectWeapon;

// Also ensure it's available as soon as script loads
if (typeof window !== 'undefined') {
    window.selectWeapon = selectWeapon;
}



// Start the game - make it globally accessible
window.startGame = function() {
    if (!selectedWeapon) {
        alert('Please select a weapon first!');
        return;
    }
    
    console.log('Starting game...');
    gameRunning = true;
    document.getElementById('startScreen').classList.add('hidden');
    
    // Reset game state
    player.x = 700;
    player.y = 500;
    player.health = 100;
    player.maxHealth = 100;
    player.speed = 2.2;
    
    // Reset upgrade levels
    player.upgradeLevels = {
        damage: 0,
        fireRate: 0,
        health: 0,
        speed: 0,
        range: 0
    };
    
    // Reset abilities
    player.abilities = {};
    player.activeEffects = [];
    visualEffects = [];
    
    // Set weapon-based stats
    const weapon = weaponTypes[selectedWeapon];
    player.damage = weapon.damage;
    player.fireRate = weapon.fireRate;
    player.range = weapon.range;
    player.weapon = selectedWeapon;
    bullets = [];
    enemyBullets = [];
    enemies = [];
    score = 0;
    xp = 0;
    level = 1;
    nextLevelXP = 100;
    gameStartTime = Date.now();
    timeSurvived = 0;
    entityLimit = 20; // Reset entity limit
    
    gameLoop();
    
    // Show stats panel during gameplay
    document.getElementById('statsPanel').style.display = 'block';
    updateStatsPanel();
};

// Update the stats panel with current player info
function updateStatsPanel() {
    if (!gameRunning || !selectedWeapon) return;
    
    // Update weapon info
    const weaponData = weaponTypes[selectedWeapon];
    const weaponNames = {
        sword: 'âš”ï¸ Sword',
        bow: 'ðŸ¹ Bow', 
        staff: 'ðŸ”® Magic Staff',
        cannon: 'ðŸ’¥ Plasma Cannon'
    };
    
    document.getElementById('weaponName').textContent = weaponNames[selectedWeapon] || 'Unknown';
    document.getElementById('weaponDamage').textContent = Math.round(player.damage);
    document.getElementById('weaponFireRate').textContent = player.fireRate.toFixed(1);
    document.getElementById('weaponRange').textContent = Math.round(player.range);
    
    // Update upgrade levels
    document.getElementById('damageLevel').textContent = `${player.upgradeLevels.damage}/5`;
    document.getElementById('fireRateLevel').textContent = `${player.upgradeLevels.fireRate}/5`;
    document.getElementById('healthLevel').textContent = `${player.upgradeLevels.health}/5`;
    document.getElementById('speedLevel').textContent = `${player.upgradeLevels.speed}/5`;
    document.getElementById('rangeLevel').textContent = `${player.upgradeLevels.range}/5`;
    
    // Update abilities
    updateAbilitiesDisplay();
    updateActiveEffectsDisplay();
}

// Update abilities display
function updateAbilitiesDisplay() {
    const weaponAbilitiesDiv = document.getElementById('weaponAbilities');
    const generalAbilitiesDiv = document.getElementById('generalAbilities');
    
    weaponAbilitiesDiv.innerHTML = '';
    generalAbilitiesDiv.innerHTML = '';
    
    // Get weapon-specific abilities
    const weaponAbilityTypes = abilityTypes.weaponSpecific[selectedWeapon];
    if (weaponAbilityTypes) {
        for (const [abilityKey, abilityData] of Object.entries(weaponAbilityTypes)) {
            const level = player.abilities[abilityKey] || 0;
            if (level > 0) {
                const abilityDiv = createAbilityDisplay(abilityData.name, level, abilityData.maxLevel, abilityData.cooldown);
                weaponAbilitiesDiv.appendChild(abilityDiv);
            }
        }
    }
    
    // Add placeholder if no weapon abilities
    if (weaponAbilitiesDiv.children.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-effects';
        placeholder.textContent = 'No weapon abilities unlocked';
        weaponAbilitiesDiv.appendChild(placeholder);
    }
    
    // Get general abilities
    const generalAbilityTypes = abilityTypes.general;
    for (const [abilityKey, abilityData] of Object.entries(generalAbilityTypes)) {
        const level = player.abilities[abilityKey] || 0;
        if (level > 0) {
            const abilityDiv = createAbilityDisplay(abilityData.name, level, abilityData.maxLevel, abilityData.cooldown);
            generalAbilitiesDiv.appendChild(abilityDiv);
        }
    }
    
    // Add placeholder if no general abilities
    if (generalAbilitiesDiv.children.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-effects';
        placeholder.textContent = 'No general abilities unlocked';
        generalAbilitiesDiv.appendChild(placeholder);
    }
}

// Create ability display element
function createAbilityDisplay(name, level, maxLevel, cooldown) {
    const abilityDiv = document.createElement('div');
    abilityDiv.className = 'ability-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ability-name';
    nameSpan.textContent = name;
    
    const levelSpan = document.createElement('span');
    levelSpan.className = 'ability-level';
    levelSpan.textContent = `${toRomanNumeral(level)}`;
    
    const cooldownSpan = document.createElement('div');
    cooldownSpan.className = 'ability-cooldown';
    cooldownSpan.textContent = `${(cooldown / 1000).toFixed(1)}s CD`;
    
    const rightDiv = document.createElement('div');
    rightDiv.style.textAlign = 'right';
    rightDiv.appendChild(levelSpan);
    rightDiv.appendChild(cooldownSpan);
    
    abilityDiv.appendChild(nameSpan);
    abilityDiv.appendChild(rightDiv);
    
    return abilityDiv;
}

// Update active effects display
function updateActiveEffectsDisplay() {
    const activeEffectsDiv = document.getElementById('activeEffectsList');
    activeEffectsDiv.innerHTML = '';
    
    if (player.activeEffects.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-effects';
        placeholder.textContent = 'No active effects';
        activeEffectsDiv.appendChild(placeholder);
        return;
    }
    
    const currentTime = Date.now();
    
    for (const effect of player.activeEffects) {
        const effectDiv = document.createElement('div');
        effectDiv.className = 'active-effect';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'effect-name';
        
        // Get effect display name
        const effectNames = {
            healing: 'ðŸ’š Regeneration',
            shield: 'ðŸ›¡ï¸ Energy Shield',
            vampiric: 'ðŸ§› Vampiric Aura',
            berserker: 'ðŸ”¥ Berserker Rage',
            piercing: 'ðŸŽ¯ Piercing Arrow',
            mana: 'âš¡ Mana Surge',
            laser: 'ðŸ”´ Laser Cannon',
            overcharge: 'âš¡ Overcharge',
            shockwave: 'ðŸŒŠ Shockwave',
            spiritBlades: 'âš”ï¸ Spirit Blades'
        };
        nameSpan.textContent = effectNames[effect.type] || effect.type;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'effect-time';
        const remainingTime = Math.max(0, (effect.endTime - currentTime) / 1000);
        timeSpan.textContent = `${remainingTime.toFixed(1)}s`;
        
        effectDiv.appendChild(nameSpan);
        effectDiv.appendChild(timeSpan);
        
        activeEffectsDiv.appendChild(effectDiv);
    }
}

// Save game state
function saveGameState() {
    if (!gameRunning) return;
    
    savedGameState = {
        player: {
            x: player.x,
            y: player.y,
            health: player.health,
            maxHealth: player.maxHealth,
            damage: player.damage,
            fireRate: player.fireRate,
            range: player.range,
            speed: player.speed,
            weapon: player.weapon,
            upgradeLevels: {...player.upgradeLevels},
            abilities: {...player.abilities},
            activeEffects: [...player.activeEffects],
    
        },
        gameData: {
            score: score,
            xp: xp,
            level: level,
            nextLevelXP: nextLevelXP,
            gameStartTime: gameStartTime,
            timeSurvived: timeSurvived,
            entityLimit: entityLimit,
            selectedWeapon: selectedWeapon,
            recentKills: [...recentKills],
            berserkerLastTriggered: berserkerLastTriggered
        },
        entities: {
            bullets: bullets.map(b => ({...b})),
            enemyBullets: enemyBullets.map(b => ({...b})),
            enemies: enemies.map(e => ({...e}))
        }
    };
    
    // Save to localStorage as backup
    localStorage.setItem('topDownShooterSave', JSON.stringify(savedGameState));
    
    // Show save indicator
    showMessage('Game Saved! (Press L to load)', '#00ff00');
    console.log('Game state saved!');
}

// Load game state
function loadGameState() {
    let stateToLoad = savedGameState;
    
    // Try localStorage if no in-memory save
    if (!stateToLoad) {
        const stored = localStorage.getItem('topDownShooterSave');
        if (stored) {
            stateToLoad = JSON.parse(stored);
        }
    }
    
    if (!stateToLoad) {
        showMessage('No saved game found!', '#ff0000');
        return;
    }
    
    // Restore player state
    Object.assign(player, stateToLoad.player);
    
    // Restore game data
    score = stateToLoad.gameData.score;
    xp = stateToLoad.gameData.xp;
    level = stateToLoad.gameData.level;
    nextLevelXP = stateToLoad.gameData.nextLevelXP;
    gameStartTime = stateToLoad.gameData.gameStartTime;
    timeSurvived = stateToLoad.gameData.timeSurvived;
    entityLimit = stateToLoad.gameData.entityLimit;
    selectedWeapon = stateToLoad.gameData.selectedWeapon;
    recentKills = stateToLoad.gameData.recentKills || [];
    berserkerLastTriggered = stateToLoad.gameData.berserkerLastTriggered || 0;
    
    // Restore entities
    bullets = stateToLoad.entities.bullets;
    enemyBullets = stateToLoad.entities.enemyBullets;
    enemies = stateToLoad.entities.enemies;
    
    // Clear visual effects to prevent issues
    visualEffects = [];
    
    // Reset UI state
    showUpgradeMenu = false;
    gameRunning = true;
    document.getElementById('startScreen').classList.add('hidden');
    
    // Show and update stats panel
    document.getElementById('statsPanel').style.display = 'block';
    updateStatsPanel();
    
    // Start the game loop if it's not running
    if (gameRunning) {
        gameLoop();
    }
    
    // Show load indicator
    showMessage('Game Loaded!', '#00ff00');
    console.log('Game state loaded!');
}

// Show temporary message on screen
function showMessage(text, color = '#ffffff') {
    const messageDiv = document.createElement('div');
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '50px';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translateX(-50%)';
    messageDiv.style.color = color;
    messageDiv.style.fontSize = '24px';
    messageDiv.style.fontWeight = 'bold';
    messageDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.pointerEvents = 'none';
    messageDiv.textContent = text;
    
    document.body.appendChild(messageDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

// Main game loop
function gameLoop() {
    if (!gameRunning) return;
    
    update();
    render();
    
    requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
    if (showUpgradeMenu) {
        return; // Pause game logic if upgrade menu is visible
    }

    // Update damage flash timers
    if (player.damageFlash > 0) {
        player.damageFlash -= 16; // Assuming ~60fps, reduce by frame time
    }
    
    for (const enemy of enemies) {
        if (enemy.damageFlash > 0) {
            enemy.damageFlash -= 16;
        }
    }

    // Removed debug logging to improve performance

    // Update player movement
    let dx = 0, dy = 0;
    
    if (keys['KeyW'] || keys['ArrowUp']) dy -= player.speed;
    if (keys['KeyS'] || keys['ArrowDown']) dy += player.speed;
    if (keys['KeyA'] || keys['ArrowLeft']) dx -= player.speed;
    if (keys['KeyD'] || keys['ArrowRight']) dx += player.speed;
    
    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }
    
    player.x += dx;
    player.y += dy;
    
    // Keep player in bounds
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    
    // Auto-aim shooting (limit bullets for performance)
    // Check for mana surge unlimited fire rate
    const manaEffect = player.activeEffects.find(effect => effect.type === 'mana');
    const fireRateCheck = manaEffect ? true : (Date.now() - player.lastShot > (1000 / player.fireRate));
    
    if (enemies.length > 0 && bullets.length < 100 && fireRateCheck) {
        // Find closest enemy
        let closestEnemy = null;
        let closestDistance = Infinity;
        
        for (const enemy of enemies) {
            const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }
        
        if (closestEnemy) {
            const angle = Math.atan2(closestEnemy.y - player.y, closestEnemy.x - player.x);
            const weapon = weaponTypes[player.weapon];
            
            // Calculate damage with active effects
            let bulletDamage = player.damage;
            
            // Apply berserker damage bonus
            const berserkerEffect = player.activeEffects.find(effect => effect.type === 'berserker');
            if (berserkerEffect) {
                bulletDamage *= (1 + berserkerEffect.damageBonus);
            }
            
            // Apply overcharge damage multiplier
            const overchargeEffect = player.activeEffects.find(effect => effect.type === 'overcharge');
            if (overchargeEffect && overchargeEffect.shotsRemaining > 0) {
                bulletDamage *= overchargeEffect.damageMultiplier;
                overchargeEffect.shotsRemaining--;
                
                // Remove effect when shots are used up
                if (overchargeEffect.shotsRemaining <= 0) {
                    const effectIndex = player.activeEffects.indexOf(overchargeEffect);
                    if (effectIndex > -1) player.activeEffects.splice(effectIndex, 1);
                    
                    // Also remove the visual effect to prevent freezing
                    for (let i = visualEffects.length - 1; i >= 0; i--) {
                        if (visualEffects[i].type === 'overcharge') {
                            visualEffects.splice(i, 1);
                        }
                    }
                }
            }
            
            // Create main bullet
            const baseBullet = {
                x: player.x + Math.cos(angle) * player.radius,
                y: player.y + Math.sin(angle) * player.radius,
                vx: Math.cos(angle) * weapon.projectileSpeed,
                vy: Math.sin(angle) * weapon.projectileSpeed,
                radius: 3,
                damage: bulletDamage,
                distanceTraveled: 0,
                weaponType: player.weapon,
                color: weapon.color
            };
            
            // Apply piercing effect
            const piercingEffect = player.activeEffects.find(effect => effect.type === 'piercing');
            if (piercingEffect) {
                baseBullet.pierceCount = piercingEffect.pierceCount;
                baseBullet.damageReduction = piercingEffect.damageReduction;
                baseBullet.color = '#ffdd00'; // Golden color for piercing
            }
            
            // Apply overcharge piercing
            if (overchargeEffect) {
                baseBullet.pierceCount = overchargeEffect.pierceCount;
                baseBullet.color = '#00ffff'; // Electric blue for overcharge
            }
            
            // Add fire enchantment if player has it
            if (player.abilities.fireshot > 0) {
                const fireData = abilityTypes.weaponSpecific.staff.fireshot;
                baseBullet.burnDamage = fireData.burnDamage[player.abilities.fireshot - 1];
                baseBullet.burnDuration = fireData.burnDuration;
                baseBullet.color = '#ff4444'; // Fire color
            }
            
            bullets.push(baseBullet);
            
            // Bow multishot ability
            if (player.weapon === 'bow' && player.abilities.multishot > 0) {
                const multishotData = abilityTypes.weaponSpecific.bow.multishot;
                const extraArrows = multishotData.extraArrows[player.abilities.multishot - 1];
                
                for (let i = 0; i < extraArrows; i++) {
                    const spreadAngle = angle + (Math.PI / 8) * (i - extraArrows / 2 + 0.5);
                    bullets.push({
                        x: player.x + Math.cos(spreadAngle) * player.radius,
                        y: player.y + Math.sin(spreadAngle) * player.radius,
                        vx: Math.cos(spreadAngle) * weapon.projectileSpeed,
                        vy: Math.sin(spreadAngle) * weapon.projectileSpeed,
                        radius: 3,
                        damage: player.damage * 0.7, // Reduced damage for extra arrows
                        distanceTraveled: 0,
                        weaponType: player.weapon,
                        color: weapon.color
                    });
                }
            }
            
            // Mana surge extra projectiles
            if (manaEffect) {
                const extraProjectiles = manaEffect.extraProjectiles;
                for (let i = 0; i < extraProjectiles; i++) {
                    const spreadAngle = angle + (Math.PI / 6) * (i - extraProjectiles / 2 + 0.5);
                    bullets.push({
                        x: player.x + Math.cos(spreadAngle) * player.radius,
                        y: player.y + Math.sin(spreadAngle) * player.radius,
                        vx: Math.cos(spreadAngle) * weapon.projectileSpeed,
                        vy: Math.sin(spreadAngle) * weapon.projectileSpeed,
                        radius: 3,
                        damage: bulletDamage,
                        distanceTraveled: 0,
                        weaponType: player.weapon,
                        color: '#44ccff' // Magical blue color
                    });
                }
            }
            
            // Update fire rate with berserker bonus
            if (berserkerEffect) {
                // Apply berserker fire rate bonus by reducing time since last shot
                const fireRateBonus = berserkerEffect.speedBonus;
                player.lastShot = Date.now() - (Date.now() - player.lastShot) * fireRateBonus;
            } else {
            player.lastShot = Date.now();
            }
        }
    }
    
    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].vx;
        bullets[i].y += bullets[i].vy;
        bullets[i].distanceTraveled += Math.sqrt(bullets[i].vx * bullets[i].vx + bullets[i].vy * bullets[i].vy); // Update distance traveled
        
        // Remove bullets that go off screen
        if (bullets[i].x < 0 || bullets[i].x > canvas.width || 
            bullets[i].y < 0 || bullets[i].y > canvas.height) {
            bullets.splice(i, 1);
        }

        // Remove bullets that exceed player's range
        if (bullets[i].distanceTraveled > player.range) {
            bullets.splice(i, 1);
            continue;
        }
    }
    
    // Spawn enemies (dynamic spawn rate and count)
    let spawnInterval = 2000; // Base: 2 seconds
    let spawnCount = 1; // Base: 1 enemy per spawn
    
    // Aggressive spawn rate scaling
    if (timeSurvived >= 30) {
        spawnInterval = 1500; // 1.5 seconds after 30s
        spawnCount = 1;
    }
    if (timeSurvived >= 60) {
        spawnInterval = 1000; // 1 second after 1 minute
        spawnCount = 2; // 2 enemies per spawn
    }
    if (timeSurvived >= 120) {
        spawnInterval = 800; // 0.8 seconds after 2 minutes
        spawnCount = 3; // 3 enemies per spawn
    }
    if (timeSurvived >= 180) {
        spawnInterval = 600; // 0.6 seconds after 3 minutes
        spawnCount = 2; // Reduce to 2 but spawn faster
    }
    
    if (Date.now() - lastSpawn > spawnInterval && enemies.length < entityLimit) {
        // Spawn multiple enemies based on time
        for (let i = 0; i < spawnCount && enemies.length < entityLimit; i++) {
        spawnEnemy();
        }
        lastSpawn = Date.now();
    }
    
    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        // Check if enemy is frozen and should be unfrozen
        if (enemy.frozen && enemy.freezeEndTime && Date.now() >= enemy.freezeEndTime) {
            if (enemy.originalSpeed) {
                enemy.speed = enemy.originalSpeed;
                enemy.frozen = false;
                enemy.freezeEndTime = null;
            }
        }
        
        // Process burn damage over time
        if (enemy.burnEndTime && Date.now() < enemy.burnEndTime) {
            // Apply burn damage every 0.5 seconds
            if (enemy.burnTickTime && Date.now() >= enemy.burnTickTime) {
                enemy.health -= enemy.burnDamage;
                enemy.damageFlash = enemy.damageFlashDuration; // Show damage flash
                enemy.burnTickTime = Date.now() + 500; // Next tick in 0.5 seconds
                
                // Add burn visual effect
                visualEffects.push({
                    type: 'burn',
                    x: enemy.x + (Math.random() - 0.5) * 20,
                    y: enemy.y + (Math.random() - 0.5) * 20,
                    startTime: Date.now(),
                    endTime: Date.now() + 300,
                    alpha: 0.8
                });
            }
        } else if (enemy.burnEndTime) {
            // Clear burn effect when expired
            enemy.burnEndTime = null;
            enemy.burnDamage = null;
            enemy.burnTickTime = null;
        }
        
        // Handle movement based on enemy type
        updateEnemyMovement(enemy);
        
        // Handle special abilities
        updateEnemyAbilities(enemy);
        
        // Check collision with player
        const playerDistance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
        
        // Check for shield collision first (larger radius)
        let shieldActive = false;
        let shieldRadius = 0;
        for (const effect of player.activeEffects) {
            if (effect.type === 'shield' && effect.remaining > 0) {
                shieldActive = true;
                shieldRadius = 45; // Shield extends beyond player
                break;
            }
        }
        
        if (shieldActive && playerDistance < shieldRadius + enemy.radius) {
            // Shield pushback
            const pushDistance = 80;
            const pushAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
            enemy.x += Math.cos(pushAngle) * pushDistance;
            enemy.y += Math.sin(pushAngle) * pushDistance;
            
            // Keep enemy within bounds
            enemy.x = Math.max(enemy.radius, Math.min(canvas.width - enemy.radius, enemy.x));
            enemy.y = Math.max(enemy.radius, Math.min(canvas.height - enemy.radius, enemy.y));
            
            // Damage the shield instead of player
            for (let j = player.activeEffects.length - 1; j >= 0; j--) {
                const effect = player.activeEffects[j];
                if (effect.type === 'shield') {
                    effect.remaining -= 5; // Reduce shield strength
                    if (effect.remaining <= 0) {
                        player.activeEffects.splice(j, 1);
                    }
                    break;
                }
            }
            
            // Add pushback visual effect
            visualEffects.push({
                type: 'shieldPush',
                x: enemy.x,
                y: enemy.y,
                startTime: Date.now(),
                endTime: Date.now() + 200,
                radius: enemy.radius + 10,
                alpha: 0.6
            });
            continue;
        }
        

        
        // Normal collision (only if no shield or enemy bypassed shield)
        if (playerDistance < player.radius + enemy.radius) {
            const damage = enemy.baseDamage || 10; // Use scaled damage if available
            player.health -= damage;
            player.damageFlash = player.damageFlashDuration; // Trigger damage flash
            
            // Reset berserker kill streak when taking damage
            recentKills = [];
            
            enemies.splice(i, 1);
            continue;
        }
        
        // Check collision with bullets
        for (let j = bullets.length - 1; j >= 0; j--) {
            // Safety check: make sure bullet still exists
            if (j >= bullets.length) continue;
            
            const bullet = bullets[j];
            if (!bullet) continue; // Additional safety check
            
            const bulletDistance = Math.sqrt((bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2);
            
            if (bulletDistance < enemy.radius + bullet.radius) {
                // AI enemies can dodge
                if (enemy.type === 'ai' && Math.random() < enemy.dodgeChance && 
                    Date.now() - enemy.lastDodge > enemy.dodgeCooldown) {
                    
                    // Dodge perpendicular to bullet direction
                    const dodgeAngle = Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2;
                    enemy.x += Math.cos(dodgeAngle) * 50;
                    enemy.y += Math.sin(dodgeAngle) * 50;
                    enemy.lastDodge = Date.now();
                    continue; // Skip damage
                }
                
                // Check for shield absorption (ability enemies)
                let absorbed = false;
                if (enemy.type === 'ability' && enemy.shieldHealth > 0) {
                    enemy.shieldHealth -= bullet.damage || 20;
                    if (enemy.shieldHealth <= 0) {
                        enemy.color = enemyTypes.ability.color; // Remove shield visual
                    }
                    absorbed = true;
                }
                
                if (!absorbed) {
                    // Check for bloodthirst one-hit kill effect
                    const bloodthirstEffect = player.activeEffects.find(effect => effect.type === 'bloodthirst');
                    let damage = bullet.damage || 20;
                    
                    if (bloodthirstEffect) {
                        // Bloodthirst mode: instant kill
                        damage = enemy.health; // Set damage to current health for instant kill
                        // Reduced logging to prevent console spam
                        if (Math.random() < 0.1) console.log('BLOODTHIRST KILL!');
                        
                        // Add special bloodthirst kill visual effect
                        visualEffects.push({
                            type: 'bloodthirstKill',
                            x: enemy.x,
                            y: enemy.y,
                            startTime: Date.now(),
                            endTime: Date.now() + 800,
                            radius: enemy.radius + 15,
                            alpha: 1.0
                        });
                    }
                    
                    enemy.health -= damage;
                    enemy.damageFlash = enemy.damageFlashDuration; // Trigger damage flash
                    
                    // Apply burn effect if bullet has burn damage
                    if (bullet.burnDamage && bullet.burnDuration) {
                        enemy.burnDamage = bullet.burnDamage;
                        enemy.burnEndTime = Date.now() + bullet.burnDuration;
                        enemy.burnTickTime = Date.now() + 500; // First tick in 0.5 seconds
                    }
                    
                    // Check for vampiric life steal
                    const vampiricEffect = player.activeEffects.find(effect => effect.type === 'vampiric');
                    if (vampiricEffect) {
                        const healAmount = damage * vampiricEffect.lifeSteal;
                        player.health = Math.min(player.maxHealth, player.health + healAmount);
                    }
                    

                }
                
                // Check for explosive rounds (cannon weapon)
                if (player.weapon === 'cannon' && player.abilities.explosive > 0) {
                    const explosiveData = abilityTypes.weaponSpecific.cannon.explosive;
                    const explosionRadius = explosiveData.explosionRadius[player.abilities.explosive - 1];
                    const explosionDamage = explosiveData.explosionDamage[player.abilities.explosive - 1];
                    
                    // Add simple explosion visual effect (no particles for performance)
                    visualEffects.push({
                        type: 'explosion',
                        x: bullet.x,
                        y: bullet.y,
                        startTime: Date.now(),
                        endTime: Date.now() + 300, // Shorter duration
                        radius: explosionRadius,
                        maxRadius: explosionRadius,
                        alpha: 0.8
                    });
                    
                    // Damage all enemies in explosion radius (defer removals)
                    const enemiesToRemove = [];
                    for (const explosionTarget of enemies) {
                        const explosionDistance = Math.sqrt(
                            (explosionTarget.x - bullet.x) ** 2 + (explosionTarget.y - bullet.y) ** 2
                        );
                        
                        if (explosionDistance <= explosionRadius) {
                            // Apply explosion damage (reduced for already hit enemy)
                            const finalDamage = explosionTarget === enemy ? explosionDamage * 0.5 : explosionDamage;
                            explosionTarget.health -= finalDamage;
                            explosionTarget.damageFlash = explosionTarget.damageFlashDuration;
                            
                            if (explosionTarget.health <= 0 && explosionTarget !== enemy) {
                                handleEnemyDeath(explosionTarget);
                                enemiesToRemove.push(explosionTarget);
                            }
                        }
                    }
                    
                    // Remove dead enemies after iteration
                    for (const deadEnemy of enemiesToRemove) {
                        const enemyIndex = enemies.indexOf(deadEnemy);
                        if (enemyIndex > -1) {
                            enemies.splice(enemyIndex, 1);
                            if (enemyIndex < i) i--; // Adjust main loop index
                        }
                    }
                }
                
                // Handle piercing bullets
                let shouldRemoveBullet = true;
                if (bullet.pierceCount && bullet.pierceCount > 0) {
                    bullet.pierceCount--;
                    
                    // Add piercing impact visual effect
                    visualEffects.push({
                        type: 'piercingImpact',
                        x: bullet.x,
                        y: bullet.y,
                        startTime: Date.now(),
                        endTime: Date.now() + 200,
                        radius: 8,
                        alpha: 0.8
                    });
                    
                    // Apply damage reduction after piercing
                    if (bullet.damageReduction) {
                        bullet.damage *= (1 - bullet.damageReduction);
                    }
                    
                    // Don't remove bullet if it can still pierce
                    if (bullet.pierceCount > 0) {
                        shouldRemoveBullet = false;
                        
                        // Add trailing effect to show bullet continues
                        visualEffects.push({
                            type: 'piercingTrail',
                            x: bullet.x,
                            y: bullet.y,
                            vx: bullet.vx * 0.3,
                            vy: bullet.vy * 0.3,
                            startTime: Date.now(),
                            endTime: Date.now() + 300,
                            alpha: 0.6
                        });
                    }
                }
                
                if (shouldRemoveBullet) {
                bullets.splice(j, 1);
                }
                
                // Break to prevent multiple hits on same enemy in one frame
                break;
            }
        }
                
                if (enemy.health <= 0) {
            // Track kill for berserker rage
            const currentTime = Date.now();
            recentKills.push(currentTime);
            
            // Check for berserker rage trigger
            if (player.abilities.berserker > 0) {
                const berserkerData = abilityTypes.weaponSpecific.sword.berserker;
                const level = player.abilities.berserker - 1;
                const killsRequired = berserkerData.killsRequired[level];
                const cooldownTime = berserkerData.cooldown[level];
                
                // Check if we have enough kills and berserker is off cooldown
                if (recentKills.length >= killsRequired && 
                    currentTime - berserkerLastTriggered > cooldownTime &&
                    !player.activeEffects.find(effect => effect.type === 'berserker')) {
                    
                    // Trigger berserker rage
                    const duration = berserkerData.duration[level];
                    player.activeEffects.push({
                        type: 'berserker',
                        endTime: currentTime + duration,
                        damageBonus: berserkerData.damageBonus[level],
                        speedBonus: berserkerData.speedBonus[level]
                    });
                    
                    // Add visual effect
                    visualEffects.push({
                        type: 'berserker',
                        x: player.x,
                        y: player.y,
                        startTime: currentTime,
                        endTime: currentTime + duration,
                        radius: 50,
                        pulseSpeed: 0.01
                    });
                    
                    berserkerLastTriggered = currentTime;
                    recentKills = []; // Reset kill counter after triggering
                }
            }
            
            // Use helper function to handle death and level up check
            handleEnemyDeath(enemy, i);
            break;
        }
    }
    
    // Check game over
    if (player.health <= 0) {
        gameOver();
    }
    
    // Update abilities
    updateAbilities();
    
    // Update active effects
    updateActiveEffects();
    
    // Update visual effects
    updateVisualEffects();
    
    // Update enemy bullets
    updateEnemyBullets();
    
    // Update time survived
    timeSurvived = Math.floor((Date.now() - gameStartTime) / 1000);
    
    // Update entity limit based on time survived (much more aggressive)
    if (timeSurvived <= 60) {
        // First minute: gradual increase from 20 to 35
        entityLimit = 20 + Math.floor(timeSurvived / 4) * 1; // +1 every 4 seconds
    } else if (timeSurvived <= 120) {
        // Second minute: rapid increase from 35 to 50  
        entityLimit = 35 + Math.floor((timeSurvived - 60) / 3) * 1; // +1 every 3 seconds
    } else if (timeSurvived <= 180) {
        // Third minute: moderate increase from 50 to 65
        entityLimit = 50 + Math.floor((timeSurvived - 120) / 6) * 1; // +1 every 6 seconds
    } else {
        // After 3 minutes: slower increase for endgame
        entityLimit = 65 + Math.floor((timeSurvived - 180) / 15) * 2; // +2 every 15 seconds
    }
    
    // Update UI
    document.getElementById('health').textContent = Math.round(player.health);
    document.getElementById('score').textContent = score;
    document.getElementById('wave').textContent = level;
    document.getElementById('xp').textContent = xp + '/' + nextLevelXP;
    document.getElementById('time').textContent = timeSurvived + 's';
    
    // Update stats panel
    updateStatsPanel();
}

// Enemy types with different stats
const enemyTypes = {
    basic: {
        radius: 15,
        speed: 1,
        health: 60,
        color: '#ff4444',
        scoreValue: 100,
        xpValue: 50
    },
    fast: {
        radius: 12,
        speed: 1.8,
        health: 40,
        color: '#ffaa44',
        scoreValue: 150,
        xpValue: 75
    },
    tank: {
        radius: 20,
        speed: 0.6,
        health: 120,
        color: '#aa4444',
        scoreValue: 200,
        xpValue: 100
    },
    elite: {
        radius: 18,
        speed: 1.4,
        health: 100,
        color: '#ff44aa',
        scoreValue: 300,
        xpValue: 150
    },
    // Advanced enemies (3+ minutes)
    ranged: {
        radius: 12,
        speed: 0.8,
        health: 80,
        color: '#ff8800',
        scoreValue: 400,
        xpValue: 150,
        shootRange: 300,
        preferredDistance: 200,
        fireRate: 2000, // 2 seconds between shots
        bulletSpeed: 6,
        bulletDamage: 15
    },
    ability: {
        radius: 16,
        speed: 1.0,
        health: 120,
        color: '#8800ff',
        scoreValue: 500,
        xpValue: 180,
        abilities: ['shield', 'dash', 'heal', 'teleport', 'burst'] // Will randomly get one
    },
    ai: {
        radius: 14,
        speed: 1.6,
        health: 90,
        color: '#00ff88',
        scoreValue: 450,
        xpValue: 160,
        dodgeChance: 0.7,
        predictionRange: 150
    }
};

// Spawn an enemy
function spawnEnemy() {
    let x, y;
    const minDistanceFromPlayer = 200; // Minimum distance from player
    const maxAttempts = 50; // Prevent infinite loops
    
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        // Spawn anywhere within the canvas bounds with some margin
        x = 50 + Math.random() * (canvas.width - 100);
        y = 50 + Math.random() * (canvas.height - 100);
        
        // Check distance from player
        const distanceFromPlayer = Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2);
        
        // Check distance from other enemies
        let tooCloseToEnemy = false;
        const minEnemyDistance = 40; // Minimum distance from other enemies during spawn
        
        for (const existingEnemy of enemies) {
            const distanceFromEnemy = Math.sqrt((x - existingEnemy.x) ** 2 + (y - existingEnemy.y) ** 2);
            if (distanceFromEnemy < minEnemyDistance) {
                tooCloseToEnemy = true;
                break;
            }
        }
        
        if (distanceFromPlayer >= minDistanceFromPlayer && !tooCloseToEnemy) {
            break; // Found a good position
        }
    }
    
    // Determine enemy type based on time survived
    let enemyType = 'basic';
    const rand = Math.random();
    
    if (timeSurvived >= 180) { // After 3 minutes - Advanced enemies appear
        if (rand < 0.15) enemyType = 'ai';
        else if (rand < 0.25) enemyType = 'ability';
        else if (rand < 0.35) enemyType = 'ranged';
        else if (rand < 0.5) enemyType = 'elite';
        else if (rand < 0.7) enemyType = 'tank';
        else if (rand < 0.9) enemyType = 'fast';
        // 10% chance for basic
    } else if (timeSurvived >= 120) { // After 2 minutes - Elite enemies appear
        if (rand < 0.3) enemyType = 'elite';
        else if (rand < 0.6) enemyType = 'tank';
        else if (rand < 0.85) enemyType = 'fast';
        // 15% chance for basic
    } else if (timeSurvived >= 60) { // 1-2 minutes - Fast + Tank
        if (rand < 0.4) enemyType = 'tank';
        else if (rand < 0.8) enemyType = 'fast';
        // 20% chance for basic
    } else if (timeSurvived >= 30) { // 30s-1min - Fast enemies appear
        if (rand < 0.6) enemyType = 'fast';
        // 40% chance for basic
    }
    // 0-30s: Only basic enemies (100% basic)
    
    const type = enemyTypes[enemyType];
    
    // Calculate scaling based on time survived
    const scalingFactor = 1 + (timeSurvived / 60) * 0.15; // +15% per minute
    const healthScaling = 1 + (timeSurvived / 30) * 0.25; // +25% every 30 seconds
    
    const enemy = {
        x: x,
        y: y,
        radius: type.radius,
        speed: type.speed,
        health: Math.round(type.health * healthScaling),
        maxHealth: Math.round(type.health * healthScaling), // Track max health for percentage abilities
        color: type.color,
        scoreValue: Math.round(type.scoreValue * scalingFactor),
        xpValue: Math.round(type.xpValue * scalingFactor),
        damageFlash: 0,
        damageFlashDuration: 200,
        type: enemyType,
        baseDamage: 10 + Math.floor(timeSurvived / 60) * 5 // Base contact damage scales +5 every minute
    };
    
    // Add special properties for advanced enemies
    if (enemyType === 'ranged') {
        enemy.lastShot = 0;
        enemy.shootRange = type.shootRange;
        enemy.preferredDistance = type.preferredDistance;
        enemy.fireRate = type.fireRate;
        enemy.bulletSpeed = type.bulletSpeed;
        enemy.bulletDamage = Math.round(type.bulletDamage * scalingFactor);
    } else if (enemyType === 'ability') {
        // Randomly assign one ability
        const randomAbility = type.abilities[Math.floor(Math.random() * type.abilities.length)];
        enemy.ability = randomAbility;
        enemy.abilityLastUsed = 0;
        enemy.abilityCooldown = 8000; // 8 seconds
        
        if (randomAbility === 'shield') {
            enemy.shieldHealth = 0;
            enemy.maxShieldHealth = 50;
        }
    } else if (enemyType === 'ai') {
        enemy.dodgeChance = type.dodgeChance;
        enemy.predictionRange = type.predictionRange;
        enemy.lastDodge = 0;
        enemy.dodgeCooldown = 1000; // 1 second between dodges
        enemy.targetX = x;
        enemy.targetY = y;
    }
    
    enemies.push(enemy);
}

// Render everything
function render() {
    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw player
    ctx.fillStyle = player.damageFlash > 0 ? '#ffffff' : '#00ffff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw bullets (weapon-specific effects)
    for (const bullet of bullets) {
        const bulletColor = bullet.color || '#00ff00';
        ctx.strokeStyle = bulletColor;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y);
        ctx.lineTo(bullet.x - bullet.vx * 2, bullet.y - bullet.vy * 2);
        ctx.stroke();
        
        // Draw bullet tip
        ctx.fillStyle = bulletColor;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add fire effects for fire bullets
        if (bullet.burnDamage > 0) {
            // Fire particles
            for (let i = 0; i < 3; i++) {
                const offsetX = (Math.random() - 0.5) * 8;
                const offsetY = (Math.random() - 0.5) * 8;
                const particleSize = Math.random() * 2 + 1;
                
                ctx.fillStyle = i === 0 ? '#ffaa00' : '#ff6600';
                ctx.beginPath();
                ctx.arc(bullet.x + offsetX, bullet.y + offsetY, particleSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Draw enemy bullets
    for (const bullet of enemyBullets) {
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw enemies
    for (const enemy of enemies) {
        ctx.fillStyle = enemy.damageFlash > 0 ? '#ffffff' : enemy.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add burn glow effect if enemy is burning
        if (enemy.burnEndTime && Date.now() < enemy.burnEndTime) {
            const burnTime = Date.now() * 0.008;
            const burnIntensity = (Math.sin(burnTime) + 1) / 2; // 0 to 1
            
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 8 + burnIntensity * 5;
            ctx.strokeStyle = '#ff4400';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6 + burnIntensity * 0.4;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius + 2, 0, Math.PI * 2);
            ctx.stroke();
            
            // Reset shadow and alpha
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        }
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Visual indicators for advanced enemy types
        if (enemy.type === 'ranged') {
            // Small targeting reticle
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (enemy.type === 'ability') {
            // Ability indicator based on ability type
            ctx.fillStyle = '#8800ff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            if (enemy.ability === 'shield') ctx.fillText('ðŸ›¡ï¸', enemy.x, enemy.y - enemy.radius - 8);
            else if (enemy.ability === 'dash') ctx.fillText('âš¡', enemy.x, enemy.y - enemy.radius - 8);
            else if (enemy.ability === 'heal') ctx.fillText('â¤ï¸', enemy.x, enemy.y - enemy.radius - 8);
            else if (enemy.ability === 'teleport') ctx.fillText('ðŸŒ€', enemy.x, enemy.y - enemy.radius - 8);
            else if (enemy.ability === 'burst') ctx.fillText('ðŸ’¥', enemy.x, enemy.y - enemy.radius - 8);
        } else if (enemy.type === 'ai') {
            // AI indicator - small triangular points
            ctx.fillStyle = '#00ff88';
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                const x = enemy.x + Math.cos(angle) * (enemy.radius + 8);
                const y = enemy.y + Math.sin(angle) * (enemy.radius + 8);
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Draw visual effects
    drawVisualEffects();
}

// Draw visual effects
function drawVisualEffects() {
    for (const effect of visualEffects) {
        ctx.save(); // Save current context state
        
        switch (effect.type) {
            case 'healing':
                // Green pulsing circle around player
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner glow
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.8, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'shield':
                // Blue shield circle around player
                ctx.globalAlpha = effect.alpha;
                ctx.strokeStyle = '#0080ff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Shield segments
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const x1 = effect.x + Math.cos(angle) * (effect.radius - 5);
                    const y1 = effect.y + Math.sin(angle) * (effect.radius - 5);
                    const x2 = effect.x + Math.cos(angle) * (effect.radius + 5);
                    const y2 = effect.y + Math.sin(angle) * (effect.radius + 5);
                    
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                break;
                
            case 'whirlwind':
                // Spinning slashes around player
                ctx.globalAlpha = 0.7;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                
                for (let i = 0; i < 6; i++) {
                    const angle = effect.rotation + (i / 6) * Math.PI * 2;
                    const innerRadius = 20;
                    const outerRadius = effect.radius;
                    
                    const x1 = effect.x + Math.cos(angle) * innerRadius;
                    const y1 = effect.y + Math.sin(angle) * innerRadius;
                    const x2 = effect.x + Math.cos(angle) * outerRadius;
                    const y2 = effect.y + Math.sin(angle) * outerRadius;
                    
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                break;
                
            case 'lightning':
                // Lightning bolts between points
                ctx.globalAlpha = effect.alpha;
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 3;
                
                for (let i = 0; i < effect.path.length - 1; i++) {
                    const start = effect.path[i];
                    const end = effect.path[i + 1];
                    
                    // Draw jagged lightning bolt
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    
                    // Add some random jitter to make it look like lightning
                    const segments = 3;
                    for (let j = 1; j <= segments; j++) {
                        const progress = j / segments;
                        const x = start.x + (end.x - start.x) * progress + (Math.random() - 0.5) * 20;
                        const y = start.y + (end.y - start.y) * progress + (Math.random() - 0.5) * 20;
                        ctx.lineTo(x, y);
                    }
                    
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                    
                    // Glow effect
                    ctx.globalAlpha = effect.alpha * 0.3;
                    ctx.lineWidth = 8;
                    ctx.stroke();
                    ctx.globalAlpha = effect.alpha;
                    ctx.lineWidth = 3;
                }
                break;
                
            case 'timeStop':
                // Time stop ripple effect
                ctx.globalAlpha = effect.alpha;
                
                for (let ring = 0; ring < effect.rings; ring++) {
                    const ringProgress = (effect.endTime - Date.now()) / (effect.endTime - effect.startTime);
                    const ringRadius = effect.radius * (1 - ringProgress) + ring * 30;
                    
                    // Outer ring - purple
                    ctx.strokeStyle = '#9933ff';
                    ctx.lineWidth = 4;
                    ctx.setLineDash([10, 5]);
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // Inner glow
                    ctx.strokeStyle = '#cc66ff';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 3]);
                    ctx.stroke();
                }
                
                // Reset line dash
                ctx.setLineDash([]);
                break;
                
            case 'shieldImpact':
                // Shield impact spark effect
                ctx.globalAlpha = effect.alpha;
                const progress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                // Spark particles radiating outward
                for (let spark = 0; spark < 6; spark++) {
                    const sparkAngle = (spark / 6) * Math.PI * 2 + progress * Math.PI;
                    const sparkDistance = effect.radius * (1 - progress);
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkDistance;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkDistance;
                    
                    ctx.fillStyle = '#00aaff';
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 2 * (1 - progress), 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Central flash
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = effect.alpha * (1 - progress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 4, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'shieldPush':
                // Shield pushback ring effect
                ctx.globalAlpha = effect.alpha;
                const pushProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                // Expanding blue ring
                ctx.strokeStyle = '#4488ff';
                ctx.lineWidth = 3 * (1 - pushProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * (1 + pushProgress), 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner glow
                ctx.strokeStyle = '#88ccff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
                
            case 'explosion':
                // Simple explosion effect (performance optimized)
                ctx.globalAlpha = effect.alpha;
                const explosionProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                // Single expanding ring
                ctx.strokeStyle = '#ff6600';
                ctx.lineWidth = 6 * (1 - explosionProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Simple center flash
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = effect.alpha * (1 - explosionProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'frost':
                // Frost Nova - expanding ice wave
                ctx.globalAlpha = 0.6;
                const frostProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                effect.currentRadius = effect.maxRadius * frostProgress;
                
                // Outer ice ring
                ctx.strokeStyle = '#88ccff';
                ctx.lineWidth = 4 * (1 - frostProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.currentRadius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Simplified frost crystals (reduced from 8 to 4 for performance)
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2 + frostProgress * Math.PI;
                    const crystalRadius = effect.currentRadius * 0.8;
                    const crystalX = effect.x + Math.cos(angle) * crystalRadius;
                    const crystalY = effect.y + Math.sin(angle) * crystalRadius;
                    
                    ctx.fillStyle = '#ccddff';
                    ctx.globalAlpha = 0.8 * (1 - frostProgress);
                    ctx.beginPath();
                    ctx.arc(crystalX, crystalY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Center ice burst
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.9 * (1 - frostProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 8 * (1 - frostProgress), 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'vampiric':
                // Vampiric Aura - dark red pulsing aura
                const vampTime = Date.now() * effect.pulseSpeed;
                const vampPulse = (Math.sin(vampTime) + 1) / 2; // 0 to 1
                
                ctx.globalAlpha = 0.3 + vampPulse * 0.2;
                
                // Dark red outer ring
                ctx.strokeStyle = '#cc0000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius + vampPulse * 10, 0, Math.PI * 2);
                ctx.stroke();
                
                // Blood-like inner glow
                ctx.fillStyle = '#660000';
                ctx.globalAlpha = 0.2 + vampPulse * 0.1;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.7, 0, Math.PI * 2);
                ctx.fill();
                
                // Simplified vampire effect (removed for performance)
                // Vampire fangs removed to improve performance
                break;
                
            case 'meteorWarning':
                // Meteor warning indicator
                const warningProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const warningPulse = Math.sin(warningProgress * Math.PI * 6); // Fast pulsing
                
                ctx.globalAlpha = 0.7 + warningPulse * 0.3;
                
                // Red warning circle
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Warning cross
                ctx.setLineDash([]);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(effect.x - effect.radius * 0.5, effect.y);
                ctx.lineTo(effect.x + effect.radius * 0.5, effect.y);
                ctx.moveTo(effect.x, effect.y - effect.radius * 0.5);
                ctx.lineTo(effect.x, effect.y + effect.radius * 0.5);
                ctx.stroke();
                break;
                
            case 'meteor':
                // Meteor explosion
                const meteorProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                // Fire explosion
                ctx.globalAlpha = 0.8 * (1 - meteorProgress);
                ctx.strokeStyle = '#ff4400';
                ctx.lineWidth = 6 * (1 - meteorProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * (1 + meteorProgress * 0.5), 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner fire core
                ctx.fillStyle = '#ffaa00';
                ctx.globalAlpha = 0.9 * (1 - meteorProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.4 * (1 - meteorProgress), 0, Math.PI * 2);
                ctx.fill();
                
                // Simplified fire sparks (reduced from 6 to 3 for performance)
                for (let i = 0; i < 3; i++) {
                    const sparkAngle = (i / 3) * Math.PI * 2 + meteorProgress * Math.PI * 2;
                    const sparkDist = effect.radius * (0.8 + meteorProgress * 0.4);
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkDist;
                    
                    ctx.fillStyle = '#ff6600';
                    ctx.globalAlpha = 0.7 * (1 - meteorProgress);
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 3 * (1 - meteorProgress), 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Center white flash
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 1.0 * (1 - meteorProgress);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 6 * (1 - meteorProgress), 0, Math.PI * 2);
                ctx.fill();
                break;
                
            // NEW WEAPON ABILITY VISUALS
            
            case 'berserker':
                // Berserker Rage - pulsing red aura
                const berserkerTime = Date.now() * 0.01;
                const berserkerPulse = (Math.sin(berserkerTime) + 1) / 2;
                
                ctx.globalAlpha = 0.3 + berserkerPulse * 0.4;
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius + berserkerPulse * 10, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner rage glow
                ctx.fillStyle = '#aa0000';
                ctx.globalAlpha = 0.2 + berserkerPulse * 0.3;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.7, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'bloodthirst':
                // Bloodthirst - INTENSE dark red/black aura with violent pulses and spikes
                const bloodTime = Date.now() * 0.025;
                const bloodPulse = (Math.sin(bloodTime) + 1) / 2;
                const violentPulse = Math.sin(bloodTime * 4) * 0.5 + 0.5; // Even faster pulse
                const spikePulse = Math.sin(bloodTime * 6) * 0.3 + 0.7; // Chaotic spike pattern
                
                // Outer dark energy ring with spikes
                ctx.globalAlpha = 0.5 + bloodPulse * 0.4;
                ctx.strokeStyle = '#aa0000';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius + violentPulse * 20, 0, Math.PI * 2);
                ctx.stroke();
                
                // Energy spikes radiating outward
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.7 + violentPulse * 0.3;
                for (let i = 0; i < 8; i++) {
                    const spikeAngle = (i / 8) * Math.PI * 2;
                    const spikeLength = 25 + spikePulse * 15;
                    const innerRadius = effect.radius * 0.9;
                    const outerRadius = innerRadius + spikeLength;
                    
                    ctx.beginPath();
                    ctx.moveTo(
                        effect.x + Math.cos(spikeAngle) * innerRadius,
                        effect.y + Math.sin(spikeAngle) * innerRadius
                    );
                    ctx.lineTo(
                        effect.x + Math.cos(spikeAngle) * outerRadius,
                        effect.y + Math.sin(spikeAngle) * outerRadius
                    );
                    ctx.stroke();
                }
                
                // Inner dark blood glow - larger and more intense
                ctx.fillStyle = '#440000';
                ctx.globalAlpha = 0.4 + violentPulse * 0.5;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.85, 0, Math.PI * 2);
                ctx.fill();
                
                // Central blood core - pulsing and bright
                ctx.fillStyle = '#ff0000';
                ctx.globalAlpha = 0.8 + violentPulse * 0.2;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.4 * (0.8 + spikePulse * 0.4), 0, Math.PI * 2);
                ctx.fill();
                
                // Inner bright white core for intensity
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.3 + violentPulse * 0.4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.15 * (0.5 + spikePulse * 0.8), 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'bloodthirstKill':
                // Special visual for bloodthirst kills - violent red explosion
                const killProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const killAlpha = (1 - killProgress) * effect.alpha;
                
                ctx.globalAlpha = killAlpha;
                
                // Expanding red burst
                const burstRadius = effect.radius * (1 + killProgress * 2);
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, burstRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Dark red outer ring
                ctx.strokeStyle = '#aa0000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, burstRadius * 1.2, 0, Math.PI * 2);
                ctx.stroke();
                
                // Blood splatter lines
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const splatAngle = (i / 6) * Math.PI * 2;
                    const splatLength = 20 + killProgress * 30;
                    
                    ctx.beginPath();
                    ctx.moveTo(effect.x, effect.y);
                    ctx.lineTo(
                        effect.x + Math.cos(splatAngle) * splatLength,
                        effect.y + Math.sin(splatAngle) * splatLength
                    );
                    ctx.stroke();
                }
                break;
                
            case 'execution':
                // Execution - dark void with red X
                const execProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                ctx.globalAlpha = 0.8 * (1 - execProgress);
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 30 * (1 + execProgress), 0, Math.PI * 2);
                ctx.fill();
                
                // Red X mark
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 6 * (1 - execProgress);
                ctx.beginPath();
                ctx.moveTo(effect.x - 15, effect.y - 15);
                ctx.lineTo(effect.x + 15, effect.y + 15);
                ctx.moveTo(effect.x + 15, effect.y - 15);
                ctx.lineTo(effect.x - 15, effect.y + 15);
                ctx.stroke();
                break;
                
            case 'piercing':
                // Piercing Arrow - golden glow with arrow trails
                const piercingTime = Date.now() * 0.008;
                const piercingPulse = (Math.sin(piercingTime) + 1) / 2;
                
                ctx.globalAlpha = 0.4 + piercingPulse * 0.3;
                ctx.strokeStyle = '#ffdd00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Golden arrow trails
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2 + piercingTime;
                    const x1 = effect.x + Math.cos(angle) * 20;
                    const y1 = effect.y + Math.sin(angle) * 20;
                    const x2 = effect.x + Math.cos(angle) * 30;
                    const y2 = effect.y + Math.sin(angle) * 30;
                    
                    ctx.strokeStyle = '#ffaa00';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                break;
                
            case 'volleyArea':
                // Volley targeting area
                const volleyProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                
                ctx.globalAlpha = 0.3 * (1 - volleyProgress);
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                break;
                
            case 'volleyArrow':
                // Individual volley arrows
                if (Date.now() >= effect.impactTime) {
                    // Impact explosion
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = '#88aa00';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Warning indicator
                    const warningPulse = Math.sin(Date.now() * 0.02);
                    ctx.globalAlpha = 0.5 + warningPulse * 0.3;
                    ctx.fillStyle = '#ffff00';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, 8, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'arcaneOrb':
                // Arcane Orb - purple glowing orb
                const orbTime = Date.now() * 0.01;
                const orbPulse = (Math.sin(orbTime) + 1) / 2;
                
                ctx.globalAlpha = 0.7 + orbPulse * 0.3;
                ctx.fillStyle = '#aa00ff';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 12 + orbPulse * 4, 0, Math.PI * 2);
                ctx.fill();
                
                // Arcane sparks
                for (let i = 0; i < 3; i++) {
                    const sparkAngle = orbTime + (i / 3) * Math.PI * 2;
                    const sparkX = effect.x + Math.cos(sparkAngle) * 20;
                    const sparkY = effect.y + Math.sin(sparkAngle) * 20;
                    
                    ctx.fillStyle = '#cc44ff';
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'mana':
                // Mana Surge - bright blue magical aura
                const manaTime = Date.now() * 0.015;
                const manaPulse = (Math.sin(manaTime) + 1) / 2;
                
                ctx.globalAlpha = 0.4 + manaPulse * 0.4;
                ctx.strokeStyle = '#0088ff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius + manaPulse * 15, 0, Math.PI * 2);
                ctx.stroke();
                
                // Magical sparkles
                for (let i = 0; i < 6; i++) {
                    const sparkAngle = manaTime * 2 + (i / 6) * Math.PI * 2;
                    const sparkDist = 30 + manaPulse * 10;
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkDist;
                    
                    ctx.fillStyle = '#44ccff';
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'laser':
                // Laser Beam - bright red energy beam
                const laserProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const laserAlpha = Math.max(0, 1 - laserProgress);
                
                ctx.globalAlpha = laserAlpha * 0.9;
                
                // Outer laser beam - red
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = effect.width;
                ctx.beginPath();
                ctx.moveTo(effect.startX, effect.startY);
                ctx.lineTo(effect.endX, effect.endY);
                ctx.stroke();
                
                // Inner laser core - bright white
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = effect.width * 0.4;
                ctx.globalAlpha = laserAlpha;
                ctx.beginPath();
                ctx.moveTo(effect.startX, effect.startY);
                ctx.lineTo(effect.endX, effect.endY);
                ctx.stroke();
                
                // Laser glow effect
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = effect.width * 1.5;
                ctx.globalAlpha = laserAlpha * 0.3;
                ctx.beginPath();
                ctx.moveTo(effect.startX, effect.startY);
                ctx.lineTo(effect.endX, effect.endY);
                ctx.stroke();
                
                // Laser end spark
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = laserAlpha * 0.8;
                ctx.beginPath();
                ctx.arc(effect.endX, effect.endY, 8, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'laserHit':
                // Laser hit effect - bright red burst
                const laserHitProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const laserHitAlpha = (1 - laserHitProgress) * effect.alpha;
                
                ctx.globalAlpha = laserHitAlpha;
                
                // Expanding red burst
                const laserHitRadius = laserHitProgress * 15;
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, laserHitRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // White center flash
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = laserHitAlpha * 1.2;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, laserHitRadius * 0.5, 0, Math.PI * 2);
                ctx.fill();
                
                // Energy sparks
                for (let i = 0; i < 4; i++) {
                    const sparkAngle = (i / 4) * Math.PI * 2;
                    const sparkDist = laserHitRadius * 1.5;
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkDist;
                    
                    ctx.fillStyle = '#ffaa44';
                    ctx.globalAlpha = laserHitAlpha * 0.8;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 2 * (1 - laserHitProgress), 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'overcharge':
                // Overcharge - electric energy
                const chargeTime = Date.now() * 0.02;
                const chargePulse = (Math.sin(chargeTime) + 1) / 2;
                
                ctx.globalAlpha = 0.5 + chargePulse * 0.4;
                
                // Electric rings
                for (let ring = 0; ring < 2; ring++) {
                    ctx.strokeStyle = ring === 0 ? '#00ffff' : '#ffffff';
                    ctx.lineWidth = 3 - ring;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, effect.radius + ring * 5 + chargePulse * 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // Lightning bolts
                for (let i = 0; i < 6; i++) {
                    const boltAngle = chargeTime * 3 + (i / 6) * Math.PI * 2;
                    const boltLength = 20 + chargePulse * 10;
                    const x1 = effect.x + Math.cos(boltAngle) * 15;
                    const y1 = effect.y + Math.sin(boltAngle) * 15;
                    const x2 = effect.x + Math.cos(boltAngle) * boltLength;
                    const y2 = effect.y + Math.sin(boltAngle) * boltLength;
                    
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                break;
                
            case 'burn':
                // Burn damage visual - orange/red flame particles
                const burnProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const burnAlpha = (1 - burnProgress) * effect.alpha;
                
                ctx.globalAlpha = burnAlpha;
                
                // Flame colors
                const flameColors = ['#ff4400', '#ff6600', '#ffaa00'];
                
                for (let i = 0; i < 3; i++) {
                    const size = (3 - i) * (1 - burnProgress * 0.5);
                    const offsetX = (Math.random() - 0.5) * 8 * (1 - burnProgress);
                    const offsetY = (Math.random() - 0.5) * 8 * (1 - burnProgress) - i * 2;
                    
                    ctx.fillStyle = flameColors[i % flameColors.length];
                    ctx.beginPath();
                    ctx.arc(effect.x + offsetX, effect.y + offsetY, size, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'piercingImpact':
                // Golden burst effect when bullet pierces through enemy
                const impactProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const impactAlpha = (1 - impactProgress) * effect.alpha;
                
                ctx.globalAlpha = impactAlpha;
                
                // Golden burst rings
                for (let ring = 0; ring < 3; ring++) {
                    const ringRadius = effect.radius * (1 + impactProgress) + ring * 3;
                    const ringAlpha = impactAlpha * (1 - ring * 0.3);
                    
                    ctx.globalAlpha = ringAlpha;
                    ctx.strokeStyle = ring === 0 ? '#ffdd00' : '#ffaa00';
                    ctx.lineWidth = 3 - ring;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // Golden spark burst
                for (let i = 0; i < 6; i++) {
                    const sparkAngle = (i / 6) * Math.PI * 2;
                    const sparkLength = 8 + impactProgress * 12;
                    const x1 = effect.x + Math.cos(sparkAngle) * 3;
                    const y1 = effect.y + Math.sin(sparkAngle) * 3;
                    const x2 = effect.x + Math.cos(sparkAngle) * sparkLength;
                    const y2 = effect.y + Math.sin(sparkAngle) * sparkLength;
                    
                    ctx.globalAlpha = impactAlpha;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                break;
                
            case 'piercingTrail':
                // Golden trailing particles showing bullet continues
                const trailProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const trailAlpha = (1 - trailProgress) * effect.alpha;
                
                // Update trail position
                effect.x += effect.vx;
                effect.y += effect.vy;
                
                ctx.globalAlpha = trailAlpha;
                
                // Golden trail particle
                const trailSize = 3 * (1 - trailProgress * 0.5);
                ctx.fillStyle = '#ffdd00';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, trailSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Inner bright core
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, trailSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'execution':
                // Death mark execution effect - dark void with red X
                const execProgress2 = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const execAlpha = (1 - execProgress2) * effect.alpha;
                
                ctx.globalAlpha = execAlpha;
                
                // Dark void background
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * (0.5 + execProgress2 * 0.5), 0, Math.PI * 2);
                ctx.fill();
                
                // Red outer ring
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * (0.8 + execProgress2 * 0.2), 0, Math.PI * 2);
                ctx.stroke();
                
                // Death mark X
                const xSize = effect.radius * 0.6;
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 6;
                ctx.globalAlpha = execAlpha * 1.5;
                
                // X mark lines
                ctx.beginPath();
                ctx.moveTo(effect.x - xSize, effect.y - xSize);
                ctx.lineTo(effect.x + xSize, effect.y + xSize);
                ctx.moveTo(effect.x + xSize, effect.y - xSize);
                ctx.lineTo(effect.x - xSize, effect.y + xSize);
                ctx.stroke();
                
                // Inner glow
                ctx.fillStyle = '#660000';
                ctx.globalAlpha = execAlpha * 0.5;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'shockwave':
                // Shockwave - expanding ring of energy
                const shockProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const ringAlpha = Math.max(0, 1 - shockProgress);
                
                ctx.globalAlpha = ringAlpha * 0.7;
                
                // Outer ring - blue energy
                ctx.strokeStyle = '#00aaff';
                ctx.lineWidth = 6 * ringAlpha;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.currentRadius, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner ring - white energy
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3 * ringAlpha;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.currentRadius * 0.8, 0, Math.PI * 2);
                ctx.stroke();
                
                // Energy sparks around the ring
                for (let i = 0; i < 8; i++) {
                    const sparkAngle = (i / 8) * Math.PI * 2 + shockProgress * Math.PI;
                    const sparkRadius = effect.currentRadius + (Math.random() - 0.5) * 10;
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkRadius;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkRadius;
                    
                    ctx.fillStyle = '#88ccff';
                    ctx.globalAlpha = ringAlpha * 0.8;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 3 * ringAlpha, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'spiritBlade':
                // Spirit Blade - glowing energy blade
                const bladeTime = Date.now() * 0.02;
                const bladePulse = (Math.sin(bladeTime + effect.bladeIndex) + 1) / 2;
                const bladeAlpha = 0.8 + bladePulse * 0.2;
                
                ctx.globalAlpha = bladeAlpha;
                
                // Blade trail (elongated in direction of movement)
                const trailLength = 25;
                const prevAngle = effect.angle - effect.rotationSpeed;
                const trailStartX = effect.x - Math.cos(effect.angle) * trailLength;
                const trailStartY = effect.y - Math.sin(effect.angle) * trailLength;
                
                // Draw blade trail
                ctx.strokeStyle = '#ff88ff';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(trailStartX, trailStartY);
                ctx.lineTo(effect.x, effect.y);
                ctx.stroke();
                
                // Inner blade core
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(trailStartX, trailStartY);
                ctx.lineTo(effect.x, effect.y);
                ctx.stroke();
                
                // Blade tip glow
                ctx.fillStyle = '#ffaaff';
                ctx.globalAlpha = bladeAlpha * 0.9;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 6 + bladePulse * 2, 0, Math.PI * 2);
                ctx.fill();
                
                // Bright center
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = bladeAlpha;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'spiritBladeHit':
                // Spirit Blade hit effect - burst of energy
                const hitProgress = (Date.now() - effect.startTime) / (effect.endTime - effect.startTime);
                const hitAlpha = (1 - hitProgress) * effect.alpha;
                
                ctx.globalAlpha = hitAlpha;
                
                // Expanding burst
                const bladeBurstRadius = hitProgress * 20;
                ctx.fillStyle = '#ff88ff';
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, bladeBurstRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // White center flash
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = hitAlpha * 1.5;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, bladeBurstRadius * 0.5, 0, Math.PI * 2);
                ctx.fill();
                
                // Spark burst
                for (let i = 0; i < 6; i++) {
                    const sparkAngle = (i / 6) * Math.PI * 2;
                    const sparkDist = bladeBurstRadius * 1.5;
                    const sparkX = effect.x + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = effect.y + Math.sin(sparkAngle) * sparkDist;
                    
                    ctx.fillStyle = '#ffccff';
                    ctx.globalAlpha = hitAlpha * 0.8;
                    ctx.beginPath();
                    ctx.arc(sparkX, sparkY, 2 * (1 - hitProgress), 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
        }
        
        ctx.restore(); // Restore context state
    }
}

// Level up function
function levelUp() {
    level++;
    nextLevelXP = 100 + (level - 1) * 50; // Level 2: 100, Level 3: 150, Level 4: 200, etc.
    
    // CRITICAL: Reset XP immediately to prevent infinite level ups!
    xp = 0;
    
    // Generate upgrade cards and show menu
    generateUpgradeCards();
    showUpgradeMenu = true;
    renderUpgradeMenu();
    
    console.log(`Level up! Now level ${level}, next level at ${nextLevelXP} XP`);
}

// Upgrade system with level caps
const upgradeSystem = {
    damage: {
        maxLevel: 5,
        effects: [15, 25, 35, 50, 70], // Cumulative bonus per level
        names: ['Weapon Mastery I', 'Weapon Mastery II', 'Weapon Mastery III', 'Weapon Mastery IV', 'Weapon Mastery V'],
        description: 'Increase your weapon\'s damage output'
    },
    fireRate: {
        maxLevel: 5,
        effects: [0.6, 1.2, 1.8, 2.4, 3.0], // Cumulative bonus shots per second (equal 0.6 intervals)
        names: ['Combat Speed I', 'Combat Speed II', 'Combat Speed III', 'Combat Speed IV', 'Combat Speed V'],
        description: 'Attack faster with your weapon'
    },
    health: {
        maxLevel: 5,
        effects: [25, 50, 80, 120, 170], // Cumulative bonus per level
        names: ['Vitality I', 'Vitality II', 'Vitality III', 'Vitality IV', 'Vitality V'],
        description: 'Increase your maximum health'
    },
    speed: {
        maxLevel: 5,
        effects: [0.3, 0.6, 1.0, 1.5, 2.0], // Cumulative bonus per level - reduced from previous values
        names: ['Agility I', 'Agility II', 'Agility III', 'Agility IV', 'Agility V'],
        description: 'Move faster across the battlefield'
    },
    range: {
        maxLevel: 5,
        effects: [50, 100, 160, 230, 320], // Cumulative bonus per level
        names: ['Reach I', 'Reach II', 'Reach III', 'Reach IV', 'Reach V'],
        description: 'Extend your weapon\'s effective range'
    }
};

// Get detailed stat description with current and next values
function getStatDescription(type, currentLevel, system) {
    const weapon = weaponTypes[player.weapon];
    let currentValue, nextValue, unit = '';
    
    switch (type) {
        case 'damage':
            const currentDamageBonus = currentLevel > 0 ? system.effects[currentLevel - 1] : 0;
            const nextDamageBonus = system.effects[currentLevel];
            currentValue = weapon.damage + currentDamageBonus;
            nextValue = weapon.damage + nextDamageBonus;
            unit = ' damage';
            break;
        case 'fireRate':
            const currentFireRateBonus = currentLevel > 0 ? system.effects[currentLevel - 1] : 0;
            const nextFireRateBonus = system.effects[currentLevel];
            // Fire rate upgrade increases shots per second
            currentValue = (weapon.fireRate + currentFireRateBonus).toFixed(1);
            nextValue = (weapon.fireRate + nextFireRateBonus).toFixed(1);
            unit = ' shots/s';
            break;
        case 'health':
            const currentHealthBonus = currentLevel > 0 ? system.effects[currentLevel - 1] : 0;
            const nextHealthBonus = system.effects[currentLevel];
            currentValue = 100 + currentHealthBonus;
            nextValue = 100 + nextHealthBonus;
            unit = ' HP';
            break;
        case 'speed':
            const currentSpeedBonus = currentLevel > 0 ? system.effects[currentLevel - 1] : 0;
            const nextSpeedBonus = system.effects[currentLevel];
            currentValue = (2.2 + currentSpeedBonus).toFixed(1);
            nextValue = (2.2 + nextSpeedBonus).toFixed(1);
            unit = ' speed';
            break;
        case 'range':
            const currentRangeBonus = currentLevel > 0 ? system.effects[currentLevel - 1] : 0;
            const nextRangeBonus = system.effects[currentLevel];
            currentValue = weapon.range + currentRangeBonus;
            nextValue = weapon.range + nextRangeBonus;
            unit = ' range';
            break;
    }
    
    return `${currentValue}${unit} â†’ ${nextValue}${unit}`;
}

// Get detailed ability description with stats
function getAbilityDescription(abilityKey, currentLevel, abilityData) {
    let description = abilityData.description + '\n\n';
    
    // Add current level stats
    if (currentLevel > 0) {
        description += `Level ${currentLevel}:\n`;
        
        // Add specific stats based on ability
        if (abilityData.damage) {
            const damage = Array.isArray(abilityData.damage) ? abilityData.damage[currentLevel - 1] : abilityData.damage;
            description += `â€¢ Damage: ${damage}\n`;
        }
        if (abilityData.range) {
            description += `â€¢ Range: ${abilityData.range}\n`;
        }
        if (abilityData.cooldown) {
            const cooldown = Array.isArray(abilityData.cooldown) ? abilityData.cooldown[currentLevel - 1] : abilityData.cooldown;
            description += `â€¢ Cooldown: ${(cooldown / 1000).toFixed(1)}s\n`;
        }
        if (abilityData.duration) {
            const duration = Array.isArray(abilityData.duration) ? abilityData.duration[currentLevel - 1] : abilityData.duration;
            description += `â€¢ Duration: ${(duration / 1000).toFixed(1)}s\n`;
        }
        if (abilityData.healAmount) {
            const heal = Array.isArray(abilityData.healAmount) ? abilityData.healAmount[currentLevel - 1] : abilityData.healAmount;
            description += `â€¢ Heal: ${heal} HP/s\n`;
        }
        if (abilityData.shieldAmount) {
            const shield = Array.isArray(abilityData.shieldAmount) ? abilityData.shieldAmount[currentLevel - 1] : abilityData.shieldAmount;
            description += `â€¢ Shield: ${shield} HP\n`;
        }
        if (abilityData.chains) {
            const chains = Array.isArray(abilityData.chains) ? abilityData.chains[currentLevel - 1] : abilityData.chains;
            description += `â€¢ Chain Jumps: ${chains}\n`;
        }
        if (abilityData.extraArrows) {
            const arrows = Array.isArray(abilityData.extraArrows) ? abilityData.extraArrows[currentLevel - 1] : abilityData.extraArrows;
            description += `â€¢ Extra Arrows: ${arrows}\n`;
        }
        if (abilityData.explosionRadius) {
            const radius = Array.isArray(abilityData.explosionRadius) ? abilityData.explosionRadius[currentLevel - 1] : abilityData.explosionRadius;
            description += `â€¢ Explosion Radius: ${radius}\n`;
        }
        if (abilityData.slowFactor) {
            const factor = Array.isArray(abilityData.slowFactor) ? abilityData.slowFactor[currentLevel - 1] : abilityData.slowFactor;
            description += `â€¢ Slow Factor: ${(factor * 100).toFixed(0)}%\n`;
        }
        if (abilityData.freezeDuration) {
            const freeze = Array.isArray(abilityData.freezeDuration) ? abilityData.freezeDuration[currentLevel - 1] : abilityData.freezeDuration;
            description += `â€¢ Freeze Duration: ${(freeze / 1000).toFixed(1)}s\n`;
        }
        if (abilityData.lifeSteal) {
            const steal = Array.isArray(abilityData.lifeSteal) ? abilityData.lifeSteal[currentLevel - 1] : abilityData.lifeSteal;
            description += `â€¢ Life Steal: ${(steal * 100).toFixed(0)}%\n`;
        }
        if (abilityData.meteorCount) {
            const meteors = Array.isArray(abilityData.meteorCount) ? abilityData.meteorCount[currentLevel - 1] : abilityData.meteorCount;
            description += `â€¢ Meteors: ${meteors}\n`;
        }
        if (abilityData.healPerSecond) {
            const heal = Array.isArray(abilityData.healPerSecond) ? abilityData.healPerSecond[currentLevel - 1] : abilityData.healPerSecond;
            description += `â€¢ Healing: ${heal} HP/s\n`;
        }
        if (abilityData.absorption) {
            const absorb = Array.isArray(abilityData.absorption) ? abilityData.absorption[currentLevel - 1] : abilityData.absorption;
            description += `â€¢ Shield Strength: ${absorb} HP\n`;
        }
        if (abilityData.damageBonus) {
            const bonus = Array.isArray(abilityData.damageBonus) ? abilityData.damageBonus[currentLevel - 1] : abilityData.damageBonus;
            description += `â€¢ Damage Bonus: +${(bonus * 100).toFixed(0)}%\n`;
        }
        if (abilityData.speedBonus) {
            const speed = Array.isArray(abilityData.speedBonus) ? abilityData.speedBonus[currentLevel - 1] : abilityData.speedBonus;
            description += `â€¢ Attack Speed: +${(speed * 100).toFixed(0)}%\n`;
        }
        if (abilityData.killsRequired) {
            const kills = Array.isArray(abilityData.killsRequired) ? abilityData.killsRequired[currentLevel - 1] : abilityData.killsRequired;
            description += `â€¢ Kill Streak Required: ${kills}\n`;
        }
        if (abilityData.enemiesRequired) {
            const enemies = Array.isArray(abilityData.enemiesRequired) ? abilityData.enemiesRequired[currentLevel - 1] : abilityData.enemiesRequired;
            description += `â€¢ Enemies Required: ${enemies} within ${abilityData.triggerRange}px\n`;
        }
        if (abilityData.triggerRange) {
            description += `â€¢ Trigger Range: ${abilityData.triggerRange}px\n`;
        }
    }
    
    // Add next level improvements
    if (currentLevel < abilityData.maxLevel) {
        description += `\nLevel ${currentLevel + 1} Upgrade:\n`;
        
        if (abilityData.damage && Array.isArray(abilityData.damage)) {
            const currentDmg = currentLevel > 0 ? abilityData.damage[currentLevel - 1] : 0;
            const nextDmg = abilityData.damage[currentLevel];
            description += `â€¢ Damage: ${currentDmg} â†’ ${nextDmg}\n`;
        }
        if (abilityData.duration && Array.isArray(abilityData.duration)) {
            const currentDur = currentLevel > 0 ? abilityData.duration[currentLevel - 1] : 0;
            const nextDur = abilityData.duration[currentLevel];
            description += `â€¢ Duration: ${(currentDur / 1000).toFixed(1)}s â†’ ${(nextDur / 1000).toFixed(1)}s\n`;
        }
        if (abilityData.healAmount && Array.isArray(abilityData.healAmount)) {
            const currentHeal = currentLevel > 0 ? abilityData.healAmount[currentLevel - 1] : 0;
            const nextHeal = abilityData.healAmount[currentLevel];
            description += `â€¢ Heal: ${currentHeal} â†’ ${nextHeal} HP/s\n`;
        }
        if (abilityData.shieldAmount && Array.isArray(abilityData.shieldAmount)) {
            const currentShield = currentLevel > 0 ? abilityData.shieldAmount[currentLevel - 1] : 0;
            const nextShield = abilityData.shieldAmount[currentLevel];
            description += `â€¢ Shield: ${currentShield} â†’ ${nextShield} HP\n`;
        }
        if (abilityData.chains && Array.isArray(abilityData.chains)) {
            const currentChains = currentLevel > 0 ? abilityData.chains[currentLevel - 1] : 0;
            const nextChains = abilityData.chains[currentLevel];
            description += `â€¢ Chain Jumps: ${currentChains} â†’ ${nextChains}\n`;
        }
        if (abilityData.extraArrows && Array.isArray(abilityData.extraArrows)) {
            const currentArrows = currentLevel > 0 ? abilityData.extraArrows[currentLevel - 1] : 0;
            const nextArrows = abilityData.extraArrows[currentLevel];
            description += `â€¢ Extra Arrows: ${currentArrows} â†’ ${nextArrows}\n`;
        }
        if (abilityData.explosionRadius && Array.isArray(abilityData.explosionRadius)) {
            const currentRadius = currentLevel > 0 ? abilityData.explosionRadius[currentLevel - 1] : 0;
            const nextRadius = abilityData.explosionRadius[currentLevel];
            description += `â€¢ Explosion Radius: ${currentRadius} â†’ ${nextRadius}\n`;
        }
        if (abilityData.freezeDuration && Array.isArray(abilityData.freezeDuration)) {
            const currentFreeze = currentLevel > 0 ? abilityData.freezeDuration[currentLevel - 1] : 0;
            const nextFreeze = abilityData.freezeDuration[currentLevel];
            description += `â€¢ Freeze Duration: ${(currentFreeze / 1000).toFixed(1)}s â†’ ${(nextFreeze / 1000).toFixed(1)}s\n`;
        }
        if (abilityData.lifeSteal && Array.isArray(abilityData.lifeSteal)) {
            const currentSteal = currentLevel > 0 ? abilityData.lifeSteal[currentLevel - 1] : 0;
            const nextSteal = abilityData.lifeSteal[currentLevel];
            description += `â€¢ Life Steal: ${(currentSteal * 100).toFixed(0)}% â†’ ${(nextSteal * 100).toFixed(0)}%\n`;
        }
        if (abilityData.meteorCount && Array.isArray(abilityData.meteorCount)) {
            const currentMeteors = currentLevel > 0 ? abilityData.meteorCount[currentLevel - 1] : 0;
            const nextMeteors = abilityData.meteorCount[currentLevel];
            description += `â€¢ Meteors: ${currentMeteors} â†’ ${nextMeteors}\n`;
        }
        if (abilityData.healPerSecond && Array.isArray(abilityData.healPerSecond)) {
            const currentHeal = currentLevel > 0 ? abilityData.healPerSecond[currentLevel - 1] : 0;
            const nextHeal = abilityData.healPerSecond[currentLevel];
            description += `â€¢ Healing: ${currentHeal} â†’ ${nextHeal} HP/s\n`;
        }
        if (abilityData.absorption && Array.isArray(abilityData.absorption)) {
            const currentAbsorb = currentLevel > 0 ? abilityData.absorption[currentLevel - 1] : 0;
            const nextAbsorb = abilityData.absorption[currentLevel];
            description += `â€¢ Shield Strength: ${currentAbsorb} â†’ ${nextAbsorb} HP\n`;
        }
        if (abilityData.range && Array.isArray(abilityData.range)) {
            const currentRange = currentLevel > 0 ? abilityData.range[currentLevel - 1] : 0;
            const nextRange = abilityData.range[currentLevel];
            description += `â€¢ Range: ${currentRange} â†’ ${nextRange}\n`;
        }
        if (abilityData.enemiesRequired && Array.isArray(abilityData.enemiesRequired)) {
            const currentEnemies = currentLevel > 0 ? abilityData.enemiesRequired[currentLevel - 1] : 0;
            const nextEnemies = abilityData.enemiesRequired[currentLevel];
            description += `â€¢ Enemies Required: ${currentEnemies} â†’ ${nextEnemies}\n`;
        }
        if (abilityData.cooldown && Array.isArray(abilityData.cooldown)) {
            const currentCooldown = currentLevel > 0 ? abilityData.cooldown[currentLevel - 1] : 0;
            const nextCooldown = abilityData.cooldown[currentLevel];
            description += `â€¢ Cooldown: ${(currentCooldown / 1000).toFixed(1)}s â†’ ${(nextCooldown / 1000).toFixed(1)}s\n`;
        }
    }
    
    return description;
}

// Convert number to Roman numeral
function toRomanNumeral(num) {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V'];
    return romanNumerals[num - 1] || num.toString();
}

// Generate random upgrade cards
function generateUpgradeCards() {
    const availableUpgrades = [];
    
    // Add stat upgrades that aren't maxed out
    for (const [type, system] of Object.entries(upgradeSystem)) {
        const currentLevel = player.upgradeLevels[type];
        if (currentLevel < system.maxLevel) {
            availableUpgrades.push({
                category: 'stat',
                type: type,
                name: system.names[currentLevel],
                description: system.description,
                detailedDescription: getStatDescription(type, currentLevel, system),
                currentLevel: currentLevel,
                maxLevel: system.maxLevel,
                nextEffect: system.effects[currentLevel]
            });
        }
    }
    
    // Add weapon-specific abilities
    const weaponAbilities = abilityTypes.weaponSpecific[player.weapon];
    if (weaponAbilities) {
        for (const [abilityKey, ability] of Object.entries(weaponAbilities)) {
            const currentLevel = player.abilities[abilityKey] || 0;
            if (currentLevel < ability.maxLevel) {
                availableUpgrades.push({
                    category: 'ability',
                    type: abilityKey,
                    name: ability.name + ` ${toRomanNumeral(currentLevel + 1)}`,
                    description: ability.description,
                    detailedDescription: getAbilityDescription(abilityKey, currentLevel, ability),
                    currentLevel: currentLevel,
                    maxLevel: ability.maxLevel,
                    isWeaponSpecific: true
                });
            }
        }
    }
    
    // Add general abilities
    for (const [abilityKey, ability] of Object.entries(abilityTypes.general)) {
        const currentLevel = player.abilities[abilityKey] || 0;
        if (currentLevel < ability.maxLevel) {
            availableUpgrades.push({
                category: 'ability',
                type: abilityKey,
                name: ability.name + ` ${toRomanNumeral(currentLevel + 1)}`,
                description: ability.description,
                detailedDescription: getAbilityDescription(abilityKey, currentLevel, ability),
                currentLevel: currentLevel,
                maxLevel: ability.maxLevel,
                isWeaponSpecific: false
            });
        }
    }
    
    // If no upgrades available, return empty (shouldn't happen normally)
    if (availableUpgrades.length === 0) {
    upgradeCards = [];
        return;
    }
    
    // Shuffle and pick up to 3 random upgrades
    upgradeCards = [];
    const shuffled = [...availableUpgrades].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(3, shuffled.length); i++) {
        upgradeCards.push(shuffled[i]);
    }
}

// Render upgrade menu
function renderUpgradeMenu() {
    // Create upgrade menu overlay
    const overlay = document.createElement('div');
    overlay.id = 'upgradeOverlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 300;
    `;
    
    const menu = document.createElement('div');
    menu.style.cssText = `
        background: #1a1a1a;
        padding: 30px;
        border: 2px solid #00ffff;
        border-radius: 10px;
        color: white;
        text-align: center;
        min-width: 800px;
    `;
    
    let cardsHTML = '<h2>Level ' + level + ' - Choose an Upgrade!</h2><div style="display: flex; justify-content: space-around; margin: 20px 0;">';
    
    upgradeCards.forEach((card, index) => {
        const progressBar = 'â– '.repeat(card.currentLevel) + 'â–¡'.repeat(card.maxLevel - card.currentLevel);
        const borderColor = card.category === 'ability' ? '#ff9900' : '#00ffff';
        const categoryLabel = card.category === 'ability' ? (card.isWeaponSpecific ? 'âš”ï¸ Weapon' : 'ðŸ”® General') : 'ðŸ“Š Stat';
        
        cardsHTML += `
            <div style="
                background: #2a2a2a;
                border: 2px solid ${borderColor};
                border-radius: 8px;
                padding: 15px;
                margin: 5px;
                width: 220px;
                cursor: pointer;
                transition: all 0.2s ease;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="buyUpgrade('${card.type}', '${card.category}')">
                <div style="font-size: 10px; color: #aaa; margin-bottom: 5px;">${categoryLabel}</div>
                <h3 style="color: ${borderColor}; margin: 0 0 10px 0;">${card.name}</h3>
                <p style="margin: 5px 0; font-size: 12px;">${card.description}</p>
                <div style="margin: 8px 0; font-size: 11px; color: #ffff88; background: rgba(255,255,0,0.1); padding: 5px; border-radius: 3px; white-space: pre-line;">
                    ${card.detailedDescription || ''}
                </div>
                <div style="margin: 8px 0; font-size: 11px; color: #aaa;">
                    Level: ${card.currentLevel}/${card.maxLevel}
                </div>
                <div style="margin: 5px 0; font-size: 10px; color: #888; font-family: monospace;">
                    ${progressBar}
                </div>
            </div>
        `;
    });
    
    cardsHTML += '</div>';
    menu.innerHTML = cardsHTML;
    
    overlay.appendChild(menu);
    document.getElementById('gameContainer').appendChild(overlay);
}

// Buy upgrade
function buyUpgrade(type, category) {
    if (category === 'stat') {
        // Handle stat upgrades
        const currentLevel = player.upgradeLevels[type];
        const system = upgradeSystem[type];
        
        // Check if upgrade is maxed out
        if (currentLevel >= system.maxLevel) {
            return; // Shouldn't happen, but safety check
        }
        
        // Apply the upgrade based on the new level
        player.upgradeLevels[type]++;
        const newLevel = player.upgradeLevels[type];
        const totalEffect = system.effects[newLevel - 1]; // -1 because array is 0-indexed
        
        // Get base weapon stats
        const weapon = weaponTypes[player.weapon];
        
    switch (type) {
        case 'damage':
                player.damage = weapon.damage + totalEffect;
            break;
        case 'fireRate':
                // Fire rate upgrade increases shots per second
                player.fireRate = weapon.fireRate + totalEffect;
            break;
        case 'health':
                const oldMaxHealth = player.maxHealth;
                player.maxHealth = 100 + totalEffect; // Base 100 + upgrade
                player.health += (player.maxHealth - oldMaxHealth); // Add the health difference
            break;
        case 'speed':
                player.speed = 2.2 + totalEffect; // Base 2.2 + upgrade
                break;
            case 'range':
                player.range = weapon.range + totalEffect;
            break;
        }
    } else if (category === 'ability') {
        // Handle ability upgrades
        const currentLevel = player.abilities[type] || 0;
        player.abilities[type] = currentLevel + 1;
        
        // Initialize ability cooldown if it's the first level
        if (currentLevel === 0) {
            player.abilities[type + '_lastUsed'] = 0;
        }
    }
    
    // Reset XP to 0 after choosing upgrade
    xp = 0;
    
    // Update UI
    document.getElementById('health').textContent = player.health;
    document.getElementById('xp').textContent = xp + '/' + nextLevelXP;
    
    // Close upgrade menu after selection
    closeUpgradeMenu();
}

// Close upgrade menu
function closeUpgradeMenu() {
    const overlay = document.getElementById('upgradeOverlay');
    if (overlay) {
        overlay.remove();
    }
    showUpgradeMenu = false;
    
    // Update stats panel after upgrade
    updateStatsPanel();
}

// Update abilities - check cooldowns and trigger abilities
function updateAbilities() {
    const currentTime = Date.now();
    
    // Check for Bloodthirst trigger (sword weapon only)
    if (player.weapon === 'sword' && player.abilities.execution > 0) {
        const bloodthirstData = abilityTypes.weaponSpecific.sword.execution;
        const level = player.abilities.execution - 1;
        const enemiesRequired = bloodthirstData.enemiesRequired[level];
        const triggerRange = bloodthirstData.triggerRange;
        const cooldownTime = bloodthirstData.cooldown[level];
        const lastUsed = player.abilities.execution_lastUsed || 0;
        
        // Check if bloodthirst is off cooldown and not already active
        if (currentTime - lastUsed >= cooldownTime && 
            !player.activeEffects.find(effect => effect.type === 'bloodthirst')) {
            
            // Count enemies within trigger range
            let nearbyEnemies = 0;
            for (const enemy of enemies) {
                const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                if (distance <= triggerRange) {
                    nearbyEnemies++;
                }
            }
            
            // Trigger bloodthirst if surrounded
            if (nearbyEnemies >= enemiesRequired) {
                const duration = bloodthirstData.duration;
                player.activeEffects.push({
                    type: 'bloodthirst',
                    endTime: currentTime + duration
                });
                
                // Add visual effect
                visualEffects.push({
                    type: 'bloodthirst',
                    x: player.x,
                    y: player.y,
                    startTime: currentTime,
                    endTime: currentTime + duration,
                    radius: 80,
                    pulseSpeed: 0.02
                });
                
                player.abilities.execution_lastUsed = currentTime;
                console.log(`BLOODTHIRST ACTIVATED! ${nearbyEnemies} enemies nearby`);
            }
        }
    }
    
    // Check each ability the player has
    for (const [abilityKey, level] of Object.entries(player.abilities)) {
        if (level > 0 && !abilityKey.endsWith('_lastUsed')) {
            const lastUsedKey = abilityKey + '_lastUsed';
            const lastUsed = player.abilities[lastUsedKey] || 0;
            
            // Get ability data
            let abilityData = null;
            if (abilityTypes.weaponSpecific[player.weapon] && abilityTypes.weaponSpecific[player.weapon][abilityKey]) {
                abilityData = abilityTypes.weaponSpecific[player.weapon][abilityKey];
            } else if (abilityTypes.general[abilityKey]) {
                abilityData = abilityTypes.general[abilityKey];
            }
            
            if (abilityData && abilityData.cooldown > 0) {
                // Check if ability is off cooldown
                if (currentTime - lastUsed >= abilityData.cooldown) {
                    triggerAbility(abilityKey, level, abilityData);
                    player.abilities[lastUsedKey] = currentTime;
                }
            }
        }
    }
}

// Update active effects (healing, shields, etc.)
function updateActiveEffects() {
    const currentTime = Date.now();
    
    for (let i = player.activeEffects.length - 1; i >= 0; i--) {
        const effect = player.activeEffects[i];
        
        // Check if effect has expired
        if (currentTime >= effect.endTime) {
            // Remove effect
            if (effect.type === 'healing') {
                // Healing effect ends naturally
            } else if (effect.type === 'shield') {
                // Shield effect ends
            }
            player.activeEffects.splice(i, 1);
            continue;
        }
        
        // Apply ongoing effects
        if (effect.type === 'healing') {
            const healAmount = effect.healPerSecond / 60; // Per frame (assuming 60fps)
            player.health = Math.min(player.maxHealth, player.health + healAmount);
        }
    }
}

// Trigger a specific ability
function triggerAbility(abilityKey, level, abilityData) {
    const currentTime = Date.now();
    
    switch (abilityKey) {
        case 'whirlwind':
            // Sword whirlwind attack
            const whirlwindDamage = abilityData.damage[level - 1];
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                
                if (distance <= abilityData.range) {
                    enemy.health -= whirlwindDamage;
                    enemy.damageFlash = enemy.damageFlashDuration;
                    
                    if (enemy.health <= 0) {
                        handleEnemyDeath(enemy, i);
                    }
                }
            }
            
            // Add whirlwind visual effect
            visualEffects.push({
                type: 'whirlwind',
                x: player.x,
                y: player.y,
                endTime: currentTime + 500, // 500ms duration
                radius: abilityData.range,
                rotation: 0
            });
            break;
            
        case 'lightning':
            // Chain lightning
            if (enemies.length > 0) {
                const chains = abilityData.chains[level - 1];
                const damage = abilityData.damage[level - 1];
                let currentTarget = enemies[0];
                let hitTargets = [currentTarget];
                
                // Find closest enemy to start chain
                let closestDistance = Infinity;
                for (const enemy of enemies) {
                    const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        currentTarget = enemy;
                    }
                }
                
                // Chain lightning effect
                let lightningPath = [{ x: player.x, y: player.y }];
                
                for (let i = 0; i < chains && hitTargets.length <= enemies.length; i++) {
                    if (currentTarget) {
                        currentTarget.health -= damage;
                        currentTarget.damageFlash = currentTarget.damageFlashDuration;
                        
                        // Add current target to lightning path
                        lightningPath.push({ x: currentTarget.x, y: currentTarget.y });
                        
                        if (currentTarget.health <= 0) {
                            const index = enemies.indexOf(currentTarget);
                            handleEnemyDeath(currentTarget, index);
                        }
                        
                        // Find next target
                        let nextTarget = null;
                        let nextDistance = Infinity;
                        for (const enemy of enemies) {
                            if (!hitTargets.includes(enemy)) {
                                const distance = Math.sqrt((currentTarget.x - enemy.x) ** 2 + (currentTarget.y - enemy.y) ** 2);
                                if (distance < nextDistance && distance <= abilityData.range) {
                                    nextDistance = distance;
                                    nextTarget = enemy;
                                }
                            }
                        }
                        
                        if (nextTarget) {
                            hitTargets.push(nextTarget);
                            currentTarget = nextTarget;
                        }
                    }
                }
                
                // Add lightning visual effect
                if (lightningPath.length > 1) {
                    visualEffects.push({
                        type: 'lightning',
                        path: lightningPath,
                        endTime: currentTime + 300, // 300ms duration
                        alpha: 1.0
                    });
                }
            }
            break;
            
        case 'healing':
            // Regeneration
            const duration = abilityData.duration[level - 1];
            const healPerSecond = abilityData.healPerSecond[level - 1];
            
            player.activeEffects.push({
                type: 'healing',
                endTime: currentTime + duration,
                healPerSecond: healPerSecond
            });
            
            // Add healing visual effect
            visualEffects.push({
                type: 'healing',
                x: player.x,
                y: player.y,
                endTime: currentTime + duration,
                radius: 0,
                maxRadius: 40
            });
            break;
            
        case 'shield':
            // Energy shield
            const shieldDuration = abilityData.duration[level - 1];
            const absorption = abilityData.absorption[level - 1];
            
            player.activeEffects.push({
                type: 'shield',
                endTime: currentTime + shieldDuration,
                absorption: absorption,
                remaining: absorption
            });
            
            // Add shield visual effect
            visualEffects.push({
                type: 'shield',
                x: player.x,
                y: player.y,
                endTime: currentTime + shieldDuration,
                radius: 35,
                alpha: 0.6
            });
            break;
            
        case 'timeStop':
            // Time dilation
            const timeDuration = abilityData.duration[level - 1];
            const slowFactor = abilityData.slowFactor[level - 1];
            
            // Apply slow effect to all enemies
            for (const enemy of enemies) {
                if (!enemy.originalSpeed) {
                    enemy.originalSpeed = enemy.speed;
                }
                enemy.speed = enemy.originalSpeed * slowFactor;
            }
            
            // Set timer to restore normal speed
            setTimeout(() => {
                for (const enemy of enemies) {
                    if (enemy.originalSpeed) {
                        enemy.speed = enemy.originalSpeed;
                    }
                }
            }, timeDuration);
            
            // Add time stop visual effect
            visualEffects.push({
                type: 'timeStop',
                x: player.x,
                y: player.y,
                startTime: currentTime,
                endTime: currentTime + timeDuration,
                radius: 200,
                alpha: 0.3,
                rings: 3
            });
            break;
            
        case 'frost':
            // Frost Nova - expanding ice wave
            const frostDamage = abilityData.damage[level - 1];
            const frostRange = abilityData.range[level - 1];
            const freezeDuration = abilityData.freezeDuration[level - 1];
            
            // Apply frost effects to all enemies in range
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                
                if (distance <= frostRange) {
                    // Damage enemy
                    enemy.health -= frostDamage;
                    enemy.damageFlash = enemy.damageFlashDuration;
                    
                    // Freeze enemy (slow them down significantly)
                    if (!enemy.originalSpeed) {
                        enemy.originalSpeed = enemy.speed;
                    }
                    enemy.speed = enemy.originalSpeed * 0.1; // 90% speed reduction
                    enemy.frozen = true;
                    
                    // Set freeze end time instead of setTimeout
                    enemy.freezeEndTime = Date.now() + freezeDuration;
                    
                    if (enemy.health <= 0) {
                        handleEnemyDeath(enemy, i);
                    }
                }
            }
            
            // Add frost nova visual effect
            visualEffects.push({
                type: 'frost',
                x: player.x,
                y: player.y,
                startTime: currentTime,
                endTime: currentTime + 1000, // 1 second expansion
                maxRadius: frostRange,
                currentRadius: 0
            });
            break;
            
        case 'vampiric':
            // Vampiric Aura - life steal effect
            const vampDuration = abilityData.duration[level - 1];
            const lifeSteal = abilityData.lifeSteal[level - 1];
            
            player.activeEffects.push({
                type: 'vampiric',
                endTime: currentTime + vampDuration,
                lifeSteal: lifeSteal
            });
            
            // Add vampiric aura visual effect
            visualEffects.push({
                type: 'vampiric',
                x: player.x,
                y: player.y,
                endTime: currentTime + vampDuration,
                radius: 50,
                pulseSpeed: 0.05
            });
            break;
            
        case 'meteor':
            // Meteor Strike - call down meteors
            const meteorDamage = abilityData.damage[level - 1];
            const meteorCount = abilityData.meteorCount[level - 1];
            const explosionRadius = abilityData.explosionRadius[level - 1];
            
            // Create meteors with time-based scheduling instead of setTimeout
            for (let i = 0; i < meteorCount; i++) {
                const meteorX = Math.random() * canvas.width;
                const meteorY = Math.random() * canvas.height;
                const warningTime = currentTime + (i * 200);
                const impactTime = warningTime + 1500;
                
                // Add warning visual first
                visualEffects.push({
                    type: 'meteorWarning',
                    x: meteorX,
                    y: meteorY,
                    startTime: warningTime,
                    endTime: impactTime,
                    radius: explosionRadius
                });
                
                // Schedule meteor impact
                visualEffects.push({
                    type: 'meteorScheduled',
                    x: meteorX,
                    y: meteorY,
                    impactTime: impactTime,
                    damage: meteorDamage,
                    radius: explosionRadius
                });
            }
            break;
            
        case 'shockwave':
            // Shockwave - expanding waves of damage
            const waveDamage = abilityData.damage[level - 1];
            const waveCount = abilityData.waveCount[level - 1];
            const maxRadius = abilityData.waveRadius[level - 1];
            const waveSpeed = abilityData.waveSpeed;
            
            // Create multiple waves with staggered timing
            for (let i = 0; i < waveCount; i++) {
                visualEffects.push({
                    type: 'shockwave',
                    x: player.x,
                    y: player.y,
                    startTime: currentTime + (i * 300), // 300ms delay between waves
                    endTime: currentTime + (i * 300) + (maxRadius / waveSpeed * 16), // Duration based on expansion time
                    maxRadius: maxRadius,
                    currentRadius: 0,
                    damage: waveDamage,
                    waveSpeed: waveSpeed,
                    waveIndex: i
                });
            }
            break;
            
        case 'spiritBlades':
            // Spirit Blades - orbiting damage dealers
            const bladeDamage = abilityData.damage[level - 1];
            const bladeCount = abilityData.bladeCount[level - 1];
            const bladeDuration = abilityData.duration[level - 1];
            const orbitRadius = abilityData.orbitRadius;
            const rotationSpeed = abilityData.rotationSpeed;
            
            // Create orbiting blades
            for (let i = 0; i < bladeCount; i++) {
                const initialAngle = (i / bladeCount) * Math.PI * 2;
                visualEffects.push({
                    type: 'spiritBlade',
                    x: player.x + Math.cos(initialAngle) * orbitRadius,
                    y: player.y + Math.sin(initialAngle) * orbitRadius,
                    startTime: currentTime,
                    endTime: currentTime + bladeDuration,
                    angle: initialAngle,
                    orbitRadius: orbitRadius,
                    rotationSpeed: rotationSpeed,
                    damage: bladeDamage,
                    lastHitTime: 0, // Prevent rapid hitting of same enemy
                    bladeIndex: i
                });
            }
            break;
            
        // NEW WEAPON-SPECIFIC ABILITIES
        
        case 'berserker':
            // Sword Berserker Rage
            if (player.health <= abilityData.healthThreshold) {
                const duration = abilityData.duration[level - 1];
                const damageBonus = abilityData.damageBonus[level - 1];
                const speedBonus = abilityData.speedBonus[level - 1];
                
                player.activeEffects.push({
                    type: 'berserker',
                    endTime: currentTime + duration,
                    damageBonus: damageBonus,
                    speedBonus: speedBonus
                });
                
                // Visual effect - red glowing aura
                visualEffects.push({
                    type: 'berserker',
                    x: player.x,
                    y: player.y,
                    endTime: currentTime + duration,
                    radius: 40,
                    intensity: 1.0
                });
            }
            break;
            
        case 'execution':
            // Sword Execute
            const executeThreshold = abilityData.healthThreshold[level - 1] / 100;
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                
                if (distance <= abilityData.range) {
                    const healthPercent = enemy.health / (enemy.maxHealth || enemy.health);
                    if (healthPercent <= executeThreshold) {
                        // Instant kill
                        handleEnemyDeath(enemy, i);
                        
                        // Execution visual effect
                        visualEffects.push({
                            type: 'execution',
                            x: enemy.x,
                            y: enemy.y,
                            startTime: currentTime,
                            endTime: currentTime + 500
                        });
                        
                        enemies.splice(i, 1);
                    }
                }
            }
            break;
            
        case 'piercing':
            // Bow Piercing Arrow
            const pierceDuration = abilityData.duration[level - 1];
            
            player.activeEffects.push({
                type: 'piercing',
                endTime: currentTime + pierceDuration,
                pierceCount: abilityData.pierceCount[level - 1],
                damageReduction: abilityData.damageReduction
            });
            
            // Visual effect - golden glow around player
            visualEffects.push({
                type: 'piercing',
                x: player.x,
                y: player.y,
                endTime: currentTime + pierceDuration,
                radius: 35
            });
            break;
            
        case 'volley':
            // Bow Arrow Volley
            const volleyArrows = abilityData.arrowCount[level - 1];
            const volleyDamage = abilityData.damage[level - 1];
            const volleyRadius = abilityData.radius[level - 1];
            
            // Target area around player or nearest enemy
            let targetX = player.x;
            let targetY = player.y;
            
            if (enemies.length > 0) {
                // Find nearest enemy
                let nearestEnemy = enemies[0];
                let nearestDistance = Infinity;
                for (const enemy of enemies) {
                    const dist = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestEnemy = enemy;
                    }
                }
                targetX = nearestEnemy.x;
                targetY = nearestEnemy.y;
            }
            
            // Create volley arrows
            for (let i = 0; i < volleyArrows; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * volleyRadius;
                const arrowX = targetX + Math.cos(angle) * distance;
                const arrowY = targetY + Math.sin(angle) * distance;
                
                visualEffects.push({
                    type: 'volleyArrow',
                    x: arrowX,
                    y: arrowY,
                    impactTime: currentTime + 1000 + (i * 100), // Staggered impacts
                    damage: volleyDamage,
                    radius: 25
                });
            }
            
            // Area indicator
            visualEffects.push({
                type: 'volleyArea',
                x: targetX,
                y: targetY,
                startTime: currentTime,
                endTime: currentTime + 1500,
                radius: volleyRadius
            });
            break;
            
        case 'arcane':
            // Staff Arcane Orb
            const orbCount = abilityData.orbCount[level - 1];
            const orbDamage = abilityData.damage[level - 1];
            
            for (let i = 0; i < orbCount; i++) {
                const angle = (i / orbCount) * Math.PI * 2;
                const orbX = player.x + Math.cos(angle) * 50;
                const orbY = player.y + Math.sin(angle) * 50;
                
                // Create seeking orb
                visualEffects.push({
                    type: 'arcaneOrb',
                    x: orbX,
                    y: orbY,
                    startTime: currentTime,
                    endTime: currentTime + 8000, // 8 second lifetime
                    damage: orbDamage,
                    seekRange: abilityData.seekRange,
                    explosionRadius: abilityData.explosionRadius,
                    speed: 2,
                    targetX: orbX,
                    targetY: orbY
                });
            }
            break;
            
        case 'mana':
            // Staff Mana Surge
            const manaDuration = abilityData.duration[level - 1];
            const extraProjectiles = abilityData.extraProjectiles[level - 1];
            
            player.activeEffects.push({
                type: 'mana',
                endTime: currentTime + manaDuration,
                extraProjectiles: extraProjectiles,
                unlimitedFireRate: true
            });
            
            // Visual effect - bright blue magical aura
            visualEffects.push({
                type: 'mana',
                x: player.x,
                y: player.y,
                endTime: currentTime + manaDuration,
                radius: 50,
                intensity: 1.0
            });
            break;
            
        case 'laser':
            // Cannon Laser Beam
            const laserCount = abilityData.laserCount[level - 1];
            const laserDamage = abilityData.laserDamage[level - 1];
            const laserWidth = abilityData.laserWidth[level - 1];
            const laserRange = abilityData.laserRange[level - 1];
            
            // Fire laser beams immediately (not a persistent effect)
            for (let i = 0; i < laserCount; i++) {
                let laserAngle;
                if (laserCount === 1) {
                    // Single laser aims at nearest enemy
                    let nearestEnemy = null;
                    let nearestDistance = Infinity;
                    for (const enemy of enemies) {
                        const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
                        if (distance < nearestDistance) {
                            nearestDistance = distance;
                            nearestEnemy = enemy;
                        }
                    }
                    laserAngle = nearestEnemy ? 
                        Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x) : 
                        Math.random() * Math.PI * 2;
                } else {
                    // Multiple lasers spread out in a fan
                    const spreadAngle = Math.PI / 3; // 60 degree spread
                    const baseAngle = enemies.length > 0 ? 
                        Math.atan2(enemies[0].y - player.y, enemies[0].x - player.x) : 0;
                    laserAngle = baseAngle - spreadAngle/2 + (i / (laserCount - 1)) * spreadAngle;
                }
                
                // Calculate laser end point
                const endX = player.x + Math.cos(laserAngle) * laserRange;
                const endY = player.y + Math.sin(laserAngle) * laserRange;
                
                // Create laser beam effect
                visualEffects.push({
                    type: 'laser',
                    startX: player.x,
                    startY: player.y,
                    endX: endX,
                    endY: endY,
                    width: laserWidth,
                    damage: laserDamage,
                    startTime: currentTime,
                    endTime: currentTime + 500, // 0.5 second beam duration
                    laserIndex: i
                });
                
                // Damage enemies along the laser path
                damageLaserPath(player.x, player.y, endX, endY, laserWidth, laserDamage);
            }
            break;
            
        case 'overcharge':
            // Cannon Overcharge
            const shotCount = abilityData.shotCount[level - 1];
            const damageMultiplier = abilityData.damageMultiplier[level - 1];
            
            player.activeEffects.push({
                type: 'overcharge',
                shotsRemaining: shotCount,
                damageMultiplier: damageMultiplier,
                pierceCount: abilityData.pierceCount
            });
            
            // Visual effect - electric energy around player
            visualEffects.push({
                type: 'overcharge',
                x: player.x,
                y: player.y,
                endTime: currentTime + 30000, // 30 seconds max
                radius: 40,
                intensity: 1.0
            });
            break;
    }
}

// Update visual effects
function updateVisualEffects() {
    const currentTime = Date.now();
    
    // Limit visual effects to prevent memory buildup (reduced for performance)
    if (visualEffects.length > 30) {
        visualEffects.splice(0, visualEffects.length - 30);
    }
    
    for (let i = visualEffects.length - 1; i >= 0; i--) {
        const effect = visualEffects[i];
        
        // Remove expired effects
        if (currentTime >= effect.endTime) {
            visualEffects.splice(i, 1);
            continue;
        }
        
        // Update effect properties
        const progress = (currentTime - (effect.endTime - effect.duration || effect.endTime - 1000)) / (effect.duration || 1000);
        
        switch (effect.type) {
            case 'healing':
                // Pulsing healing circle
                effect.radius = effect.maxRadius * (0.5 + 0.5 * Math.sin(currentTime * 0.01));
                effect.x = player.x; // Follow player
                effect.y = player.y;
                break;
                
            case 'shield':
                // Shield follows player and pulses
                effect.x = player.x;
                effect.y = player.y;
                effect.alpha = 0.6 + 0.2 * Math.sin(currentTime * 0.008);
                break;
                
            case 'whirlwind':
                // Rotating whirlwind effect
                effect.rotation += 0.3;
                break;
                
            case 'lightning':
                // Fading lightning
                effect.alpha = 1.0 - progress;
                break;
                
            case 'explosion':
                // Simple explosion update (no particles)
                const explosionProgress = (currentTime - effect.startTime) / (effect.endTime - effect.startTime);
                effect.radius = effect.maxRadius * explosionProgress;
                effect.alpha = Math.max(0, 0.8 * (1 - explosionProgress));
                break;
                
            case 'vampiric':
                // Vampiric aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                
            case 'berserker':
                // Berserker aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                
            case 'bloodthirst':
                // Bloodthirst aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                
            case 'piercing':
                // Piercing aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                
            case 'mana':
                // Mana surge aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                

                
            case 'overcharge':
                // Overcharge aura follows player
                effect.x = player.x;
                effect.y = player.y;
                break;
                
            case 'arcaneOrb':
                // Arcane orb seeking behavior
                let nearestEnemy = null;
                let nearestDistance = Infinity;
                
                // Find nearest enemy within seek range
                for (const enemy of enemies) {
                    const dist = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                    if (dist < nearestDistance && dist <= effect.seekRange) {
                        nearestDistance = dist;
                        nearestEnemy = enemy;
                    }
                }
                
                if (nearestEnemy) {
                    // Move towards nearest enemy
                    const dx = nearestEnemy.x - effect.x;
                    const dy = nearestEnemy.y - effect.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 5) { // Don't jitter when very close
                        effect.x += (dx / distance) * effect.speed;
                        effect.y += (dy / distance) * effect.speed;
                        effect.targetX = nearestEnemy.x;
                        effect.targetY = nearestEnemy.y;
                    } else {
                        // Explode when close to enemy
                        for (let j = enemies.length - 1; j >= 0; j--) {
                            const enemy = enemies[j];
                            const explosionDist = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                            
                            if (explosionDist <= effect.explosionRadius) {
                                enemy.health -= effect.damage;
                                enemy.damageFlash = enemy.damageFlashDuration;
                                
                                if (enemy.health <= 0) {
                                    handleEnemyDeath(enemy, j);
                                }
                            }
                        }
                        
                        // Add explosion visual
                        visualEffects.push({
                            type: 'explosion',
                            x: effect.x,
                            y: effect.y,
                            startTime: currentTime,
                            endTime: currentTime + 500,
                            radius: effect.explosionRadius,
                            maxRadius: effect.explosionRadius,
                            alpha: 0.8
                        });
                        
                        // Remove the orb
                        visualEffects.splice(i, 1);
                    }
                } else {
                    // No enemy found, drift slowly
                    effect.x += (Math.random() - 0.5) * 0.5;
                    effect.y += (Math.random() - 0.5) * 0.5;
                }
                break;
                
            case 'volleyArrow':
                // Check if volley arrow should impact
                if (currentTime >= effect.impactTime) {
                    // Damage enemies in area
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        const distance = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                        
                        if (distance <= effect.radius) {
                            enemy.health -= effect.damage;
                            enemy.damageFlash = enemy.damageFlashDuration;
                            
                            if (enemy.health <= 0) {
                                handleEnemyDeath(enemy, j);
                            }
                        }
                    }
                    
                    // Mark for removal after brief visual
                    effect.impacted = true;
                    effect.endTime = currentTime + 200; // Quick removal
                }
                break;
                
            case 'meteorScheduled':
                // Check if meteor should impact
                if (currentTime >= effect.impactTime) {
                    // Damage enemies in explosion radius
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        const distance = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                        
                        if (distance <= effect.radius) {
                            enemy.health -= effect.damage;
                            enemy.damageFlash = enemy.damageFlashDuration;
                            
                            if (enemy.health <= 0) {
                                handleEnemyDeath(enemy, j);
                            }
                        }
                    }
                    
                    // Add meteor explosion visual
                    visualEffects.push({
                        type: 'meteor',
                        x: effect.x,
                        y: effect.y,
                        startTime: currentTime,
                        endTime: currentTime + 800,
                        radius: effect.radius,
                        maxRadius: effect.radius * 1.5
                    });
                    
                    // Remove the scheduled meteor
                    visualEffects.splice(i, 1);
                }
                break;
                
            case 'shockwave':
                // Update shockwave expansion and damage
                if (currentTime >= effect.startTime && currentTime <= effect.endTime) {
                    // Expand the wave
                    const elapsed = currentTime - effect.startTime;
                    effect.currentRadius = Math.min(elapsed * effect.waveSpeed / 16, effect.maxRadius);
                    
                    // Check for enemy hits
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        const distance = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                        
                        // Hit if enemy is within the wave ring (current radius Â± 10 pixels)
                        if (Math.abs(distance - effect.currentRadius) <= 15 && !enemy.hitByShockwave) {
                            enemy.health -= effect.damage;
                            enemy.damageFlash = enemy.damageFlashDuration;
                            enemy.hitByShockwave = currentTime; // Mark hit to prevent multiple hits
                            
                            if (enemy.health <= 0) {
                                handleEnemyDeath(enemy, j);
                            }
                        }
                    }
                }
                
                // Clean up shockwave hit markers (reset after 100ms)
                for (const enemy of enemies) {
                    if (enemy.hitByShockwave && currentTime - enemy.hitByShockwave > 100) {
                        delete enemy.hitByShockwave;
                    }
                }
                break;
                
            case 'spiritBlade':
                // Update spirit blade position and damage
                if (currentTime >= effect.startTime && currentTime <= effect.endTime) {
                    // Update rotation
                    effect.angle += effect.rotationSpeed;
                    
                    // Update position around player
                    effect.x = player.x + Math.cos(effect.angle) * effect.orbitRadius;
                    effect.y = player.y + Math.sin(effect.angle) * effect.orbitRadius;
                    
                    // Check for enemy hits (with cooldown to prevent rapid hitting)
                    if (currentTime - effect.lastHitTime > 300) { // 300ms hit cooldown
                        for (let j = enemies.length - 1; j >= 0; j--) {
                            const enemy = enemies[j];
                            const distance = Math.sqrt((effect.x - enemy.x) ** 2 + (effect.y - enemy.y) ** 2);
                            
                            if (distance <= 20) { // 20 pixel hit radius
                                enemy.health -= effect.damage;
                                enemy.damageFlash = enemy.damageFlashDuration;
                                effect.lastHitTime = currentTime;
                                
                                // Add hit visual effect
                                visualEffects.push({
                                    type: 'spiritBladeHit',
                                    x: effect.x,
                                    y: effect.y,
                                    startTime: currentTime,
                                    endTime: currentTime + 200,
                                    alpha: 0.8
                                });
                                
                                if (enemy.health <= 0) {
                                    handleEnemyDeath(enemy, j);
                                }
                                break; // Only hit one enemy per frame
                            }
                        }
                    }
                }
                break;
        }
    }
}

// Update enemy movement based on type
function updateEnemyMovement(enemy) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (enemy.type === 'ranged') {
        // Ranged enemies keep preferred distance
        if (distance > enemy.preferredDistance + 50) {
            // Too far, move closer
            enemy.x += (dx / distance) * enemy.speed;
            enemy.y += (dy / distance) * enemy.speed;
        } else if (distance < enemy.preferredDistance - 50) {
            // Too close, move away
            enemy.x -= (dx / distance) * enemy.speed;
            enemy.y -= (dy / distance) * enemy.speed;
        }
        // In optimal range, strafe
        else {
            const strafeAngle = Math.atan2(dy, dx) + Math.PI / 2;
            enemy.x += Math.cos(strafeAngle) * enemy.speed * 0.5;
            enemy.y += Math.sin(strafeAngle) * enemy.speed * 0.5;
        }
    } else if (enemy.type === 'ai') {
        // AI enemies predict player movement and dodge
        const currentTime = Date.now();
        
        // Update target position (predict where player will be)
        if (currentTime - enemy.lastDodge > 500) { // Update prediction every 0.5s
            const playerVelX = (player.x - (enemy.lastPlayerX || player.x)) * 2; // Rough velocity
            const playerVelY = (player.y - (enemy.lastPlayerY || player.y)) * 2;
            
            enemy.targetX = player.x + playerVelX;
            enemy.targetY = player.y + playerVelY;
            enemy.lastPlayerX = player.x;
            enemy.lastPlayerY = player.y;
        }
        
        // Move towards predicted position
        const targetDx = enemy.targetX - enemy.x;
        const targetDy = enemy.targetY - enemy.y;
        const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
        
        if (targetDistance > 0) {
            enemy.x += (targetDx / targetDistance) * enemy.speed;
            enemy.y += (targetDy / targetDistance) * enemy.speed;
        }
    } else {
        // Basic movement for other enemy types
        if (distance > 0) {
            enemy.x += (dx / distance) * enemy.speed;
            enemy.y += (dy / distance) * enemy.speed;
        }
    }
    
    // Apply enemy-to-enemy collision after movement calculation
    applyEnemyCollision(enemy);
}

// Apply collision detection between enemies to prevent stacking
function applyEnemyCollision(currentEnemy) {
    const minSeparation = 5; // Minimum pixels between enemy edges
    
    for (const otherEnemy of enemies) {
        if (otherEnemy === currentEnemy) continue;
        
        const dx = currentEnemy.x - otherEnemy.x;
        const dy = currentEnemy.y - otherEnemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = currentEnemy.radius + otherEnemy.radius + minSeparation;
        
        // If enemies are too close, push them apart
        if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance;
            const pushDistance = overlap / 2;
            
            // Normalize the direction vector
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            
            // Push both enemies apart (but we only modify the current enemy here)
            // The other enemy will be handled when it's its turn to update
            currentEnemy.x += normalizedDx * pushDistance;
            currentEnemy.y += normalizedDy * pushDistance;
            
            // Ensure enemy stays within bounds after collision
            currentEnemy.x = Math.max(currentEnemy.radius, Math.min(canvas.width - currentEnemy.radius, currentEnemy.x));
            currentEnemy.y = Math.max(currentEnemy.radius, Math.min(canvas.height - currentEnemy.radius, currentEnemy.y));
        }
    }
}

// Update enemy special abilities
function updateEnemyAbilities(enemy) {
    const currentTime = Date.now();
    
    if (enemy.type === 'ranged') {
        // Ranged enemy shooting
        const distanceToPlayer = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
        
        if (distanceToPlayer <= enemy.shootRange && 
            currentTime - enemy.lastShot > enemy.fireRate) {
            
            // Shoot at player (limit enemy bullets for performance)
            if (enemyBullets.length < 50) { // Limit enemy bullets
                const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
                enemyBullets.push({
                    x: enemy.x,
                    y: enemy.y,
                    vx: Math.cos(angle) * enemy.bulletSpeed,
                    vy: Math.sin(angle) * enemy.bulletSpeed,
                    damage: enemy.bulletDamage,
                    radius: 4,
                    color: '#ff4444'
                });
            }
            
            enemy.lastShot = currentTime;
        }
    } else if (enemy.type === 'ability' && enemy.ability) {
        // Ability enemy using abilities
        if (currentTime - enemy.abilityLastUsed > enemy.abilityCooldown) {
            switch (enemy.ability) {
                case 'shield':
                    enemy.shieldHealth = enemy.maxShieldHealth;
                    enemy.color = '#4444ff'; // Visual indicator
                    setTimeout(() => {
                        enemy.shieldHealth = 0;
                        enemy.color = enemyTypes.ability.color;
                    }, 5000);
                    break;
                    
                case 'dash':
                    // Quick dash towards player
                    const dashDx = player.x - enemy.x;
                    const dashDy = player.y - enemy.y;
                    const dashDistance = Math.sqrt(dashDx * dashDx + dashDy * dashDy);
                    if (dashDistance > 0) {
                        enemy.x += (dashDx / dashDistance) * 100; // Dash 100 pixels
                        enemy.y += (dashDy / dashDistance) * 100;
                    }
                    break;
                    
                case 'heal':
                    // Heal to full health
                    enemy.health = Math.min(enemy.health + 40, enemyTypes.ability.health);
                    break;
                    
                case 'teleport':
                    // Teleport closer to player
                    const teleportAngle = Math.random() * Math.PI * 2;
                    const teleportDistance = 80 + Math.random() * 40; // 80-120 pixels from player
                    enemy.x = player.x + Math.cos(teleportAngle) * teleportDistance;
                    enemy.y = player.y + Math.sin(teleportAngle) * teleportDistance;
                    
                    // Keep within bounds
                    enemy.x = Math.max(enemy.radius, Math.min(canvas.width - enemy.radius, enemy.x));
                    enemy.y = Math.max(enemy.radius, Math.min(canvas.height - enemy.radius, enemy.y));
                    break;
                    
                case 'burst':
                    // Fire bullets in all directions (limit for performance)
                    if (enemyBullets.length < 40) { // Safety limit
                        for (let i = 0; i < 6; i++) { // Reduced from 8 to 6
                            const burstAngle = (i / 6) * Math.PI * 2;
                            enemyBullets.push({
                                x: enemy.x,
                                y: enemy.y,
                                vx: Math.cos(burstAngle) * 4,
                                vy: Math.sin(burstAngle) * 4,
                                damage: 12,
                                radius: 3,
                                color: '#ff44ff'
                            });
                        }
                    }
                    break;
            }
            enemy.abilityLastUsed = currentTime;
        }
    }
}

// Update enemy bullets
function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        
        // Move bullet
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        // Remove bullets that go off screen
        if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
            enemyBullets.splice(i, 1);
            continue;
        }
        
        // Check collision with player or shield
        const distance = Math.sqrt((bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2);
        
        // Check for shield collision first (larger radius)
        let shieldActive = false;
        let shieldRadius = 45; // Same as enemy collision
        for (const effect of player.activeEffects) {
            if (effect.type === 'shield' && effect.remaining > 0) {
                shieldActive = true;
                break;
            }
        }
        
        const collisionRadius = shieldActive ? shieldRadius : player.radius;
        
        if (distance < bullet.radius + collisionRadius) {
            // Check for shield absorption
            let absorbed = false;
            if (shieldActive) {
                for (let j = player.activeEffects.length - 1; j >= 0; j--) {
                    const effect = player.activeEffects[j];
                    if (effect.type === 'shield' && effect.remaining > 0) {
                        effect.remaining -= bullet.damage;
                        if (effect.remaining <= 0) {
                            player.activeEffects.splice(j, 1);
                        }
                        absorbed = true;
                        
                        // Add shield impact visual effect
                        visualEffects.push({
                            type: 'shieldImpact',
                            x: bullet.x,
                            y: bullet.y,
                            startTime: Date.now(),
                            endTime: Date.now() + 300,
                            radius: 15,
                            alpha: 0.8
                        });
                        break;
                    }
                }
            }
            
            if (!absorbed) {
                player.health -= bullet.damage;
                player.damageFlash = player.damageFlashDuration;
                
                // Reset berserker kill streak when taking damage
                recentKills = [];
            }
            
            enemyBullets.splice(i, 1);
        }
    }
}

// Game over
function gameOver() {
    gameRunning = false;
    alert(`Game Over! Score: ${score}`);
    document.getElementById('startScreen').classList.remove('hidden');
    
    // Hide stats panel
    document.getElementById('statsPanel').style.display = 'none';
    
    // Reset weapon selection
    selectedWeapon = null;
    document.querySelectorAll('.weapon-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    console.log('Game Over!'); // Explicitly log game over
}

// Ensure functions are available immediately
window.selectWeapon = selectWeapon;

// Initialize when page loads - multiple fallbacks for GitHub Pages
function initializeGame() {
    console.log('Game loading...');
    init();
    
    // Add event listeners as backup to onclick
    setTimeout(() => {
        console.log('Setting up weapon selection...');
        
        // Setup original weapon cards
        const weaponCards = document.querySelectorAll('.weapon-card');
        console.log('Found weapon cards:', weaponCards.length);
        
        weaponCards.forEach((card, index) => {
            const weapons = ['sword', 'bow', 'staff', 'cannon'];
            const weapon = weapons[index];
            
            // Add multiple event types for better compatibility
            ['click', 'mousedown', 'touchstart'].forEach(eventType => {
                card.addEventListener(eventType, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`${eventType} on card for weapon:`, weapon);
                    selectWeapon(weapon);
                }, { passive: false });
            });
        });
        
        // Setup fallback buttons with IDs
        const fallbackButtons = {
            'fallback-sword': 'sword',
            'fallback-bow': 'bow', 
            'fallback-staff': 'staff',
            'fallback-cannon': 'cannon'
        };
        
        Object.entries(fallbackButtons).forEach(([buttonId, weapon]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                console.log('Setting up fallback button:', buttonId, weapon);
                
                ['click', 'mousedown', 'touchstart'].forEach(eventType => {
                    button.addEventListener(eventType, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`Fallback ${eventType} for weapon:`, weapon);
                        
                        // Highlight the selected button
                        Object.keys(fallbackButtons).forEach(id => {
                            const btn = document.getElementById(id);
                            if (btn) btn.style.background = '#444';
                        });
                        button.style.background = '#006600';
                        
                        selectWeapon(weapon);
                    }, { passive: false });
                });
            } else {
                console.warn('Fallback button not found:', buttonId);
            }
        });
        
        console.log('Weapon selection setup complete');
    }, 100);
}

// Multiple initialization approaches for better compatibility
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

window.addEventListener('load', initializeGame);

// Debug function to test weapon selection manually
window.testWeaponSelection = function() {
    console.log('Testing weapon selection...');
    console.log('selectWeapon function available:', typeof window.selectWeapon);
    selectWeapon('bow');
};

// Manual weapon selection functions for console use
window.selectSword = () => selectWeapon('sword');
window.selectBow = () => selectWeapon('bow');
window.selectStaff = () => selectWeapon('staff');
window.selectCannon = () => selectWeapon('cannon');

// Emergency start function if everything else fails
window.emergencyStart = function(weaponType = 'bow') {
    console.log('Emergency start with weapon:', weaponType);
    selectedWeapon = weaponType;
    
    // Force start the game
    gameRunning = true;
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('statsPanel').style.display = 'block';
    
    // Initialize player with selected weapon
    const weapon = weaponTypes[weaponType];
    player.weapon = weaponType;
    player.damage = weapon.damage;
    player.fireRate = weapon.fireRate;
    player.range = weapon.range;
    
    updateStatsPanel();
    gameLoop();
    
    console.log('Game started with emergency method!');
}; 
