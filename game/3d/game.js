// =============================================================================
//  游戏设置与状态变量
// =============================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;

canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

window.gameState = {
    playerX: 1.5,
    playerY: 1.5,
    playerAngle: 0,
    fov: Math.PI / 3,
    speed: 0.05,
    angle: 0.04,
    // **【修改】**: 太阳相关的状态会由 updateSunPosition 动态计算
    sunAngle: 0, 
    sunY: 0,
    sunVisible: false,
    lightLevel: 1.0, // 光照强度 (0.0 为黑夜, 1.0 为白天)
};

// 地图
const MAP_SIZE = 101;
let worldMap = [];

// 小地图和轨迹
const TRAIL_MAX_LENGTH = 200;
const playerTrail = [];
let lastTrailPos = { x: window.gameState.playerX, y: window.gameState.playerY };
const TRAIL_RECORD_DISTANCE = 0.5;

// 输入状态
const keysPressed = {};


// =============================================================================
//  迷宫生成与工具函数 (这部分无需修改)
// =============================================================================

function generateMaze(width, height) {
    if (width % 2 === 0 || height % 2 === 0) {
        throw new Error("迷宫的宽度和高度必须是奇数。");
    }
    const maze = Array.from({ length: height }, () => Array(width).fill(1));
    const cellWidth = (width - 1) / 2;
    const cellHeight = (height - 1) / 2;
    const stack = [];
    const visited = Array.from({ length: cellHeight }, () => Array(cellWidth).fill(false));

    let startX = Math.floor(Math.random() * cellWidth);
    let startY = Math.floor(Math.random() * cellHeight);

    visited[startY][startX] = true;
    stack.push([startX, startY]);
    maze[2 * startY + 1][2 * startX + 1] = 0;

    while (stack.length > 0) {
        const [currentX, currentY] = stack[stack.length - 1];
        const neighbors = [];
        const directions = [[0, -1, 'N'], [0, 1, 'S'], [-1, 0, 'W'], [1, 0, 'E']];
        for (const [dx, dy, dir] of directions) {
            const nx = currentX + dx;
            const ny = currentY + dy;
            if (nx >= 0 && nx < cellWidth && ny >= 0 && ny < cellHeight && !visited[ny][nx]) {
                neighbors.push([nx, ny, dir]);
            }
        }

        if (neighbors.length > 0) {
            const [nextX, nextY, direction] = neighbors[Math.floor(Math.random() * neighbors.length)];
            if (direction === 'N') maze[2 * currentY][2 * currentX + 1] = 0;
            if (direction === 'S') maze[2 * currentY + 2][2 * currentX + 1] = 0;
            if (direction === 'W') maze[2 * currentY + 1][2 * currentX] = 0;
            if (direction === 'E') maze[2 * currentY + 1][2 * currentX + 2] = 0;
            maze[2 * nextY + 1][2 * nextX + 1] = 0;
            visited[nextY][nextX] = true;
            stack.push([nextX, nextY]);
        } else {
            stack.pop();
        }
    }
    maze[1][0] = 0;
    maze[height - 2][width - 1] = 0;
    return maze;
}

function getPaddedViewport(map, playerPos, eyeRadius) {
    const { y: playerY, x: playerX } = playerPos;
    const viewportSize = eyeRadius * 2 + 1;
    const viewport = Array.from({ length: viewportSize }, () => Array(viewportSize).fill(0));

    for (let y = 0; y < viewportSize; y++) {
        for (let x = 0; x < viewportSize; x++) {
            const mapY = playerY - eyeRadius + y;
            const mapX = playerX - eyeRadius + x;
            if (mapY >= 0 && mapY < map.length && mapX >= 0 && mapX < map[0].length) {
                viewport[y][x] = map[mapY][mapX];
            }
        }
    }
    return viewport;
}


// =============================================================================
//  绘图函数 (使用 gameState)
// =============================================================================

function drawRaycastingView() {
    // 1. **【新功能】** 绘制天空和太阳 (在墙体之前)
    
    // 定义颜色
    const sunDayColor = { r: 135, g: 206, b: 235 }; // 白天太阳附近颜色
    const skyDayColor = { r: 0, g: 0, b: 139 };     // 白天远离太阳颜色
    const skyNightColor = { r: 5, g: 5, b: 20 };    // 夜晚天空颜色

    // 根据光照强度混合颜色
    const sunR = skyNightColor.r + (sunDayColor.r - skyNightColor.r) * gameState.lightLevel;
    const sunG = skyNightColor.g + (sunDayColor.g - skyNightColor.g) * gameState.lightLevel;
    const sunB = skyNightColor.b + (sunDayColor.b - skyNightColor.b) * gameState.lightLevel;
    const skyR = skyNightColor.r + (skyDayColor.r - skyNightColor.r) * gameState.lightLevel;
    const skyG = skyNightColor.g + (skyDayColor.g - skyNightColor.g) * gameState.lightLevel;
    const skyB = skyNightColor.b + (skyDayColor.b - skyNightColor.b) * gameState.lightLevel;

    // 绘制天空渐变
    for (let i = 0; i < SCREEN_WIDTH; i++) {
        const rayAngle = (gameState.playerAngle - gameState.fov / 2) + (i / SCREEN_WIDTH) * gameState.fov;
        
        let angleDiff = Math.abs(gameState.sunAngle - rayAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const sunProximity = 1 - (angleDiff / Math.PI);

        const r = skyR + (sunR - skyR) * sunProximity;
        const g = skyG + (sunG - skyG) * sunProximity;
        const b = skyB + (sunB - skyB) * sunProximity;

        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, SCREEN_HEIGHT / 2);
        ctx.stroke();
    }
    
    // 如果太阳可见，绘制它
    if (gameState.sunVisible) {
        let sunAngleRelativeToPlayer = gameState.sunAngle - gameState.playerAngle;
        if (sunAngleRelativeToPlayer < -Math.PI) sunAngleRelativeToPlayer += 2 * Math.PI;
        if (sunAngleRelativeToPlayer > Math.PI) sunAngleRelativeToPlayer -= 2 * Math.PI;

        if (Math.abs(sunAngleRelativeToPlayer) < gameState.fov / 2) {
            const sunScreenX = (sunAngleRelativeToPlayer / (gameState.fov / 2)) * (SCREEN_WIDTH / 2) + (SCREEN_WIDTH / 2);
            const sunRadius = 20;

            // 绘制太阳外发光
            const glow = ctx.createRadialGradient(sunScreenX, gameState.sunY, sunRadius * 0.5, sunScreenX, gameState.sunY, sunRadius * 1.5);
            glow.addColorStop(0, 'rgba(255, 255, 180, 0.8)');
            glow.addColorStop(1, 'rgba(255, 255, 180, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(sunScreenX - sunRadius * 2, gameState.sunY - sunRadius * 2, sunRadius * 4, sunRadius * 4);
            
            ctx.fillStyle = 'rgba(255, 255, 224, 1)'; // 亮黄色
            ctx.beginPath();
            ctx.arc(sunScreenX, gameState.sunY, sunRadius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }


    // 2. 绘制地面
    const groundNightColor = 30;
    const groundDayColor = 100;
    const groundColor = groundNightColor + (groundDayColor - groundNightColor) * gameState.lightLevel;
    ctx.fillStyle = `rgb(${groundColor}, ${groundColor}, ${groundColor})`;
    ctx.fillRect(0, SCREEN_HEIGHT / 2, SCREEN_WIDTH, SCREEN_HEIGHT / 2);

    // 3. 绘制墙体
    for (let i = 0; i < SCREEN_WIDTH; i++) {
        const rayAngle = (gameState.playerAngle - gameState.fov / 2) + (i / SCREEN_WIDTH) * gameState.fov;
        let distanceToWall = 0;
        let hitWall = false;
        const eyeX = Math.cos(rayAngle);
        const eyeY = Math.sin(rayAngle);

        while (!hitWall && distanceToWall < 16) {
            distanceToWall += 0.1;
            const testX = Math.floor(gameState.playerX + eyeX * distanceToWall);
            const testY = Math.floor(gameState.playerY + eyeY * distanceToWall);

            if (testX < 0 || testX >= MAP_SIZE || testY < 0 || testY >= MAP_SIZE) {
                hitWall = true;
                distanceToWall = 16;
            } else if (worldMap[testY][testX] === 1) {
                hitWall = true;
            }
        }
        
        const fisheyeCorrection = Math.cos(rayAngle - gameState.playerAngle);
        distanceToWall *= fisheyeCorrection;

        const lineHeight = Math.min(SCREEN_HEIGHT, SCREEN_HEIGHT / distanceToWall);
        const drawStart = SCREEN_HEIGHT / 2 - lineHeight / 2;
        
        // **【修改】**: 墙体亮度受光照强度影响
        const wallMaxShade = 255 * (1 - distanceToWall / 10);
        const shade = Math.max(0, Math.min(255, wallMaxShade * gameState.lightLevel));
        const wallColor = `rgb(${shade}, ${shade}, ${shade})`;
        
        ctx.strokeStyle = wallColor;
        ctx.beginPath();
        ctx.moveTo(i, drawStart);
        ctx.lineTo(i, drawStart + lineHeight);
        ctx.stroke();
    }
}


function drawMinimap(viewport, minimapPos, minimapSizePx, playerFloatPos, trailPoints, playerAngle) {
    const { x: minimapX, y: minimapY } = minimapPos;
    const viewportHeight = viewport.length;
    const viewportWidth = viewport[0].length;
    const blockSize = minimapSizePx / viewportWidth;
    const centerScreenX = minimapX + minimapSizePx / 2;
    const centerScreenY = minimapY + minimapSizePx / 2;
    const centerTileX = Math.floor(viewportWidth / 2);
    const centerTileY = Math.floor(viewportHeight / 2);
    const { y: playerFloatY, x: playerFloatX } = playerFloatPos;
    const offsetX = (playerFloatX - Math.floor(playerFloatX)) * blockSize;
    const offsetY = (playerFloatY - Math.floor(playerFloatY)) * blockSize;

    ctx.save();
    ctx.beginPath();
    ctx.rect(minimapX, minimapY, minimapSizePx, minimapSizePx);
    ctx.clip();

    for (let y = 0; y < viewportHeight; y++) {
        for (let x = 0; x < viewportWidth; x++) {
            const rectX = centerScreenX - offsetX + (x - centerTileX) * blockSize;
            const rectY = centerScreenY - offsetY + (y - centerTileY) * blockSize;
            ctx.fillStyle = viewport[y][x] === 1 ? 'rgb(128,128,128)' : 'rgb(0,0,0)';
            ctx.fillRect(rectX, rectY, Math.ceil(blockSize), Math.ceil(blockSize));
        }
    }

    ctx.fillStyle = 'rgb(0,255,0)';
    for (const point of trailPoints) {
        const relativeTileX = point.x - Math.floor(playerFloatX) + centerTileX;
        const relativeTileY = point.y - Math.floor(playerFloatY) + centerTileY;
        const trailScreenX = centerScreenX - offsetX + (relativeTileX - centerTileX) * blockSize;
        const trailScreenY = centerScreenY - offsetY + (relativeTileY - centerTileY) * blockSize;
        ctx.beginPath();
        ctx.arc(trailScreenX, trailScreenY, 2, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgb(50,50,50)';
    ctx.strokeRect(minimapX, minimapY, minimapSizePx, minimapSizePx);
    
    ctx.fillStyle = 'rgb(255,0,0)';
    ctx.beginPath();
    ctx.arc(centerScreenX, centerScreenY, Math.max(2, blockSize / 1.5), 0, 2 * Math.PI);
    ctx.fill();

    const lineLength = 15;
    const endX = centerScreenX + Math.cos(playerAngle) * lineLength;
    const endY = centerScreenY + Math.sin(playerAngle) * lineLength;
    ctx.strokeStyle = 'rgb(0,255,255)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerScreenX, centerScreenY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}


// =============================================================================
//  游戏主循环与逻辑更新 (使用 gameState)
// =============================================================================

// **【新功能】** 根据真实时间计算太阳位置和光照
function updateSunPosition() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // 一天总共有 24 * 60 = 1440 分钟
    const totalMinutes = hours * 60 + minutes;
    const dayProgress = totalMinutes / 1440; // 当天时间进度 (0.0 - 1.0)
    
    // 定义日出(6:00)和日落(18:00)的时间点
    const sunriseTime = 6 / 24;  // 0.25
    const sunsetTime = 18 / 24; // 0.75
    const dayDuration = sunsetTime - sunriseTime;

    // 判断太阳是否可见
    if (dayProgress > sunriseTime && dayProgress < sunsetTime) {
        gameState.sunVisible = true;
        
        // 计算白天过去了多少 (0.0 - 1.0)
        const sunPathProgress = (dayProgress - sunriseTime) / dayDuration;
        
        // 1. 更新太阳的水平角度 (从东到西，即 PI 到 0)
        gameState.sunAngle = Math.PI - (sunPathProgress * Math.PI);
        
        // 2. 更新太阳的高度 (使用sin函数模拟弧线轨迹)
        const sunHeightFactor = Math.sin(sunPathProgress * Math.PI);
        gameState.sunY = (SCREEN_HEIGHT / 2) - (sunHeightFactor * SCREEN_HEIGHT * 0.4);
        
        // 3. 更新光照强度
        // 在日出日落时更柔和
        const morningEveningFade = Math.sin(sunPathProgress * Math.PI);
        gameState.lightLevel = Math.max(0.1, morningEveningFade); // 最低光照为0.1
        
    } else {
        // 现在是夜晚
        gameState.sunVisible = false;
        gameState.lightLevel = 0.1; // 夜晚的微弱光照
    }
}

function update() {
    // **【新功能】** 每帧都更新太阳的位置
    updateSunPosition();
    
    if (keysPressed['a']) gameState.playerAngle -= gameState.angle;
    if (keysPressed['d']) gameState.playerAngle += gameState.angle;
    
    let moveX = 0;
    let moveY = 0;
    if (keysPressed['w']) {
        moveX += Math.cos(gameState.playerAngle) * gameState.speed;
        moveY += Math.sin(gameState.playerAngle) * gameState.speed;
    }
    if (keysPressed['s']) {
        moveX -= Math.cos(gameState.playerAngle) * gameState.speed;
        moveY -= Math.sin(gameState.playerAngle) * gameState.speed;
    }

    const nextPlayerX = gameState.playerX + moveX;
    const nextPlayerY = gameState.playerY + moveY;
    if (worldMap[Math.floor(gameState.playerY)][Math.floor(nextPlayerX)] === 0) {
        gameState.playerX = nextPlayerX;
    }
    if (worldMap[Math.floor(nextPlayerY)][Math.floor(gameState.playerX)] === 0) {
        gameState.playerY = nextPlayerY;
    }
    
    const dx = gameState.playerX - lastTrailPos.x;
    const dy = gameState.playerY - lastTrailPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > TRAIL_RECORD_DISTANCE) {
        playerTrail.push({ x: gameState.playerX, y: gameState.playerY });
        if (playerTrail.length > TRAIL_MAX_LENGTH) {
            playerTrail.shift();
        }
        lastTrailPos = { x: gameState.playerX, y: gameState.playerY };
    }
}

function render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // 这一步会按正确顺序绘制所有东西：天空、太阳、地面、墙体
    drawRaycastingView();

    drawMinimap(
        viewport, 
        { x: 10, y: 10 }, 
        200, 
        { y: gameState.playerY, x: gameState.playerX }, 
        playerTrail, 
        gameState.playerAngle
    );
}

// 修正：在循环外定义 viewport，因为它在 render 中需要
let viewport = [];
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    
    // 修正：在 render 之前计算小地图的 viewport
    const eyeRadius = 10;
    const playerPosInt = { y: Math.floor(gameState.playerY), x: Math.floor(gameState.playerX) };
    viewport = getPaddedViewport(worldMap, playerPosInt, eyeRadius);

    render();

    requestAnimationFrame(gameLoop);
}


// =============================================================================
//  初始化与启动
// =============================================================================

window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
});

console.log("正在生成迷宫...");
worldMap = generateMaze(MAP_SIZE, MAP_SIZE);
console.log("迷宫生成完毕，游戏开始！");
requestAnimationFrame(gameLoop);