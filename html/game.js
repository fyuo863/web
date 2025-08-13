// =============================================================================
//  游戏设置与状态变量 (对应 Python 中的全局变量)
// =============================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;

canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// 玩家状态
let playerX = 1.5;
let playerY = 1.5;
let playerAngle = 0;
const fov = Math.PI / 3;
const speed = 0.05;

// 地图
const MAP_SIZE = 101;
let worldMap = [];

// 小地图和轨迹
const TRAIL_MAX_LENGTH = 200;
const playerTrail = []; // 用普通数组模拟 deque
let lastTrailPos = { x: playerX, y: playerY };
const TRAIL_RECORD_DISTANCE = 0.5;

// 输入状态
const keysPressed = {};


// =============================================================================
//  迷宫生成与工具函数 (对应 Python 中的函数)
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
        // N, S, W, E
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
//  绘图函数
// =============================================================================

function drawRaycastingView() {
    ctx.fillStyle = 'rgb(50, 50, 50)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT / 2); // 天花板
    ctx.fillStyle = 'rgb(100, 100, 100)';
    ctx.fillRect(0, SCREEN_HEIGHT / 2, SCREEN_WIDTH, SCREEN_HEIGHT / 2); // 地板

    for (let i = 0; i < SCREEN_WIDTH; i++) {
        const rayAngle = (playerAngle - fov / 2) + (i / SCREEN_WIDTH) * fov;
        let distanceToWall = 0;
        let hitWall = false;
        const eyeX = Math.cos(rayAngle);
        const eyeY = Math.sin(rayAngle);

        while (!hitWall && distanceToWall < 16) {
            distanceToWall += 0.1;
            const testX = Math.floor(playerX + eyeX * distanceToWall);
            const testY = Math.floor(playerY + eyeY * distanceToWall);

            if (testX < 0 || testX >= MAP_SIZE || testY < 0 || testY >= MAP_SIZE) {
                hitWall = true;
                distanceToWall = 16;
            } else if (worldMap[testY][testX] === 1) {
                hitWall = true;
            }
        }

        const fisheyeCorrection = Math.cos(rayAngle - playerAngle);
        distanceToWall *= fisheyeCorrection;

        const lineHeight = Math.min(SCREEN_HEIGHT, SCREEN_HEIGHT / distanceToWall);
        const drawStart = SCREEN_HEIGHT / 2 - lineHeight / 2;
        
        const shade = Math.max(0, Math.min(255, 255 * (1 - distanceToWall / 10)));
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

    // 剪裁区域
    ctx.save();
    ctx.beginPath();
    ctx.rect(minimapX, minimapY, minimapSizePx, minimapSizePx);
    ctx.clip();

    // 绘制地图
    for (let y = 0; y < viewportHeight; y++) {
        for (let x = 0; x < viewportWidth; x++) {
            const rectX = centerScreenX - offsetX + (x - centerTileX) * blockSize;
            const rectY = centerScreenY - offsetY + (y - centerTileY) * blockSize;
            ctx.fillStyle = viewport[y][x] === 1 ? 'rgb(128,128,128)' : 'rgb(0,0,0)';
            ctx.fillRect(rectX, rectY, Math.ceil(blockSize), Math.ceil(blockSize));
        }
    }

    // 绘制轨迹
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
    ctx.restore(); // 取消剪裁

    // 绘制边框和玩家
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
//  游戏主循环与逻辑更新
// =============================================================================

function update() {
    // 玩家移动
    if (keysPressed['a']) playerAngle -= 0.04;
    if (keysPressed['d']) playerAngle += 0.04;
    
    let moveX = 0;
    let moveY = 0;
    if (keysPressed['w']) {
        moveX += Math.cos(playerAngle) * speed;
        moveY += Math.sin(playerAngle) * speed;
    }
    if (keysPressed['s']) {
        moveX -= Math.cos(playerAngle) * speed;
        moveY -= Math.sin(playerAngle) * speed;
    }

    // 碰撞检测
    const nextPlayerX = playerX + moveX;
    const nextPlayerY = playerY + moveY;
    if (worldMap[Math.floor(playerY)][Math.floor(nextPlayerX)] === 0) {
        playerX = nextPlayerX;
    }
    if (worldMap[Math.floor(nextPlayerY)][Math.floor(playerX)] === 0) {
        playerY = nextPlayerY;
    }
    
    // 更新轨迹
    const dx = playerX - lastTrailPos.x;
    const dy = playerY - lastTrailPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > TRAIL_RECORD_DISTANCE) {
        playerTrail.push({ x: playerX, y: playerY });
        if (playerTrail.length > TRAIL_MAX_LENGTH) {
            playerTrail.shift(); // 如果超出最大长度，移除最旧的点
        }
        lastTrailPos = { x: playerX, y: playerY };
    }
}

function render() {
    // 清空画布
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // 绘制3D视图
    drawRaycastingView();

    // 绘制小地图
    const eyeRadius = 10;
    const playerPosInt = { y: Math.floor(playerY), x: Math.floor(playerX) };
    const viewport = getPaddedViewport(worldMap, playerPosInt, eyeRadius);
    drawMinimap(
        viewport, 
        { x: 10, y: 10 }, 
        200, 
        { y: playerY, x: playerX }, 
        playerTrail, 
        playerAngle
    );
}

// 游戏主循环
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop);
}


// =============================================================================
//  初始化与启动
// =============================================================================

// 监听键盘事件
window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
});

// 生成迷宫并启动游戏
console.log("正在生成迷宫...");
worldMap = generateMaze(MAP_SIZE, MAP_SIZE);
console.log("迷宫生成完毕，游戏开始！");
requestAnimationFrame(gameLoop);