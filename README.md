# Top-Down Shooter - Upgrade & Survive

A thrilling top-down shooter game where you fight increasingly difficult waves of enemies while upgrading your abilities and stats.

## 🎮 Game Features

### Core Gameplay
- **Top-down shooting**: Move with WASD, aim with mouse, click to shoot
- **Wave-based progression**: Face increasingly difficult waves of enemies
- **Multiple enemy types**: Basic, Fast, Tank, and Boss enemies
- **Smooth controls**: Responsive movement and shooting mechanics

### Upgrade System
- **Damage Upgrades**: Increase weapon damage
- **Fire Rate Upgrades**: Shoot faster
- **Health Upgrades**: Increase maximum health
- **Speed Upgrades**: Move faster
- **Multi Shot**: Shoot multiple bullets at once
- **Piercing**: Bullets pass through enemies

### Enemy Types
- **Basic Enemies**: Standard enemies with balanced stats
- **Fast Enemies**: Quick but fragile enemies
- **Tank Enemies**: Slow but heavily armored
- **Boss Enemies**: Powerful enemies with high health and damage

## 🚀 How to Play

### Controls
- **WASD** or **Arrow Keys**: Move player
- **Mouse**: Aim
- **Left Click**: Shoot
- **Space**: Pause game and open upgrade menu

### Objective
Survive as many waves as possible by:
1. Eliminating all enemies in each wave
2. Avoiding enemy contact
3. Collecting XP from defeated enemies
4. Upgrading your abilities between waves

### Strategy Tips
- **Prioritize upgrades**: Focus on damage and fire rate early
- **Stay mobile**: Keep moving to avoid enemy swarms
- **Use cover**: Use the grid to your advantage
- **Manage resources**: Save XP for powerful upgrades like Multi Shot and Piercing

## 🛠️ Installation & Setup

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for local server)

### Running the Game

1. **Clone or download** the project files
2. **Open terminal** in the project directory
3. **Start the server**:
   ```bash
   python3 -m http.server 8000
   ```
4. **Open your browser** and go to:
   ```
   http://localhost:8000
   ```

### Alternative: Direct File Opening
You can also open `index.html` directly in your browser, but some features may be limited due to CORS policies.

## 🎯 Game Mechanics

### Scoring System
- **Score**: Earned by killing enemies
- **XP**: Used for purchasing upgrades
- **Wave Progression**: Each wave increases in difficulty

### Enemy Scaling
- **Wave 1-2**: Basic enemies only
- **Wave 3+**: Fast enemies appear
- **Wave 5+**: Tank enemies appear
- **Wave 10+**: Boss enemies appear

### Upgrade Costs
- **Damage**: 50 XP
- **Fire Rate**: 75 XP
- **Health**: 100 XP
- **Speed**: 60 XP
- **Multi Shot**: 200 XP
- **Piercing**: 300 XP

## 🎨 Technical Details

### Built With
- **HTML5 Canvas**: For game rendering
- **Vanilla JavaScript**: ES6 modules for game logic
- **CSS3**: Modern styling with gradients and animations
- **Responsive Design**: Works on desktop and mobile

### Architecture
- **Modular Design**: Separate classes for each game component
- **Event-Driven**: Clean separation of input and game logic
- **Performance Optimized**: Efficient collision detection and rendering

### File Structure
```
top-down-shooter/
├── index.html          # Main HTML file
├── package.json        # Project configuration
├── README.md          # This file
└── src/
    ├── main.js        # Main game entry point
    ├── styles.css     # Game styling
    ├── components/
    │   └── UIManager.js
    └── game/
        ├── Game.js
        ├── Player.js
        ├── Enemy.js
        ├── Bullet.js
        ├── BulletManager.js
        ├── EnemyManager.js
        └── WaveManager.js
```

## 🎮 Game States

1. **Start Screen**: Welcome screen with controls
2. **Gameplay**: Active shooting and movement
3. **Upgrade Menu**: Pause to purchase upgrades
4. **Game Over**: Final score and restart option

## 🔧 Customization

### Modifying Game Balance
Edit the following files to adjust game difficulty:
- `src/game/Player.js`: Player stats and abilities
- `src/game/Enemy.js`: Enemy types and properties
- `src/game/WaveManager.js`: Wave progression and spawning
- `src/game/Game.js`: Upgrade costs and effects

### Adding New Features
The modular architecture makes it easy to add:
- New enemy types
- Additional upgrades
- Power-ups and special abilities
- Different game modes

## 🐛 Troubleshooting

### Common Issues
1. **Game won't start**: Check browser console for JavaScript errors
2. **Controls not working**: Ensure the canvas has focus
3. **Performance issues**: Close other browser tabs or applications

### Browser Compatibility
- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Edge**: Full support

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Feel free to contribute by:
- Reporting bugs
- Suggesting new features
- Submitting pull requests
- Improving documentation

---

**Enjoy the game!** 🎮
