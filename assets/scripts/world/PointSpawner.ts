import { _decorator, Component, Node, SpriteFrame, Sprite, UITransform, view, Rect, Vec3, tween, Label, LabelOutline, LabelShadow, Color, Vec2 } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';
import { Collectible, CollectibleType } from './Collectible';
import { HudManager } from '../ui/HudManager';
import { PlayerController } from '../player/PlayerController';
import { AudioManager } from '../audio/AudioManager';

const { ccclass, property } = _decorator;

@ccclass('PointSpawner')
export class PointSpawner extends Component {

    // Finish line logic (pillars + tape)
    private _finishTapeNode: Node | null = null;          // Root node for finish line
    private _finishTapeVisualNode: Node | null = null;    // Child node that renders the tape
    @property({ type: SpriteFrame, tooltip: 'SpriteFrame for finish tape (no pillars)' })
    finishTapeSpriteFrame: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'SpriteFrame for finish pillar' })
    finishPillarSpriteFrame: SpriteFrame | null = null;
    @property({ tooltip: 'Seconds to wait after finish-ready before spawning finish tape' })
    finishDelaySeconds: number = 5;
    @property({ type: SpriteFrame, tooltip: 'SpriteFrame used for confetti particles (optional)' })
    confettiSpriteFrame: SpriteFrame | null = null;
    @property({ tooltip: 'Horizontal distance from tape center to each pillar center (px)' })
    pillarOffsetX: number = 160;

    @property({ type: Node, tooltip: 'Reference to the Player node' })
    playerNode: Node | null = null;

    @property({ type: HudManager, tooltip: 'Reference to HudManager for score updates' })
    hudManager: HudManager | null = null;

    @property({ type: AudioManager, tooltip: 'Reference to AudioManager for collect sound' })
    audioManager: AudioManager | null = null;

    @property({ type: Node, tooltip: 'ScoreContainer node (fly-to target for collected points)' })
    scoreContainerNode: Node | null = null;

    @property({ type: SpriteFrame, tooltip: 'SpriteFrame for dollar points (money2.png)' })
    dollarSpriteFrame: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: 'SpriteFrame for paypal points (paypal2.webp)' })
    paypalSpriteFrame: SpriteFrame | null = null;

    @property({ tooltip: 'World scroll speed in px/s (match BackgroundScroller / DecorationScroller)' })
    worldScrollSpeed: number = 300;

    /* ─── constants ─── */

    private static readonly DESIGN_HEIGHT = 720;
    private static readonly LAYER_HEIGHT_RATIO = 383 / 720;
    private static readonly MIN_LAYER_HEIGHT_RATIO = 0.5;
    /** Shrink collision boxes to 60% of visual size */
    private static readonly HITBOX_SHRINK = 0.6;
    /** Design-size of a single point sprite */
    private static readonly POINT_SIZE_DESIGN = 80;
    /** Buffer past right edge for spawning */
    private static readonly SPAWN_BUFFER = 100;
    /** Player height as fraction of viewport (must match PlayerController) */
    private static readonly PLAYER_HEIGHT_RATIO = 150 / 720;

    /* pre-tutorial */
    private static readonly PRE_TUTORIAL_DELAY = 1.0;
    private static readonly PRE_TUTORIAL_SPACING = 200;

    /* post-tutorial pyramids */
    private static readonly PYRAMID_MIN_DIST = 1100;
    private static readonly PYRAMID_MAX_DIST = 1500;
    private static readonly PYRAMID_POINT_GAP = 300;

    /* fly animation */
    private static readonly FLY_DURATION = 0.5;
    private static readonly FLY_SPIN_DEGREES = 720;
    private static readonly FLY_END_SCALE = 0.3;

    /* ─── runtime state ─── */

    private _active = false;
    private _postTutorial = false;
    private _collectibles: Collectible[] = [];
    private _vw = 1280;
    private _vh = 720;

    // Game over UI
    @property({ type: SpriteFrame, tooltip: 'Fail sprite for game over' })
    failSpriteFrame: SpriteFrame | null = null;
    @property({ type: Node, tooltip: 'GameOver panel node' })
    gameOverPanelNode: Node | null = null;
    private _failNode: Node | null = null;

    /* pre-tutorial */
    private _preDelayTimer = 0;
    private _preDelayDone = false;
    private _nextPreSpawnDist = 0;
    private _preAlternate = false; // false = dollar first
    private _preSpawnCount = 0;
    private static readonly PRE_TUTORIAL_MAX = 2;

    /* post-tutorial */
    private _nextPyramidDist = 0;
    private _finishTapeTriggered: boolean = false;
    private _finishPhaseScheduled: boolean = false;
    private _finishPhaseStarted: boolean = false;
    private _finishPhaseTimer: number = 0;

    /* ─── lifecycle ─── */

    onLoad() {
        this.cacheViewport();
        GameManager.events.on('state-changed', this.onStateChanged, this);
        GameManager.events.on('finish-ready', this.onFinishReady, this);
    }
    /** Called when player passes all 5 enemies. Schedule finish phase after a short delay. */
    private onFinishReady() {
        this._finishPhaseScheduled = true;
        this._finishPhaseStarted = false;
        this._finishPhaseTimer = this.finishDelaySeconds;
    }

    /** Actually start finish phase: disable collectibles and spawn finish tape */
    private startFinishPhase() {
        if (this._finishPhaseStarted) return;
        this._finishPhaseStarted = true;

        // Spawn finish line root just outside right edge
        if (this._finishTapeNode) {
            this._finishTapeNode.destroy();
        }
        this._finishTapeTriggered = false;
        const root = new Node('FinishLineRoot');
        root.parent = this.node.parent || this.node;

        // Root has the tape-sized UITransform used for collision
        const ut = root.addComponent(UITransform);
        const tapeW = 300; // px, adjust as needed
        const tapeH = 400; // px, 10x original 40px height
        ut.setContentSize(tapeW, tapeH);
        ut.anchorX = 0.5;
        ut.anchorY = 0;
        // Place just outside right edge, at player feet Y
        const x = this._vw / 2 + tapeW / 2 + 40;
        const y = this.getPlayerFeetY();
        root.setPosition(x, y, 0);

        // Tape visual as child so we can replace it with halves without affecting pillars
        const tapeNode = new Node('TapeSprite');
        tapeNode.parent = root;
        const tapeSprite = tapeNode.addComponent(Sprite);
        if (this.finishTapeSpriteFrame) tapeSprite.spriteFrame = this.finishTapeSpriteFrame;
        tapeSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        tapeSprite.trim = false;
        const tapeUT = tapeNode.addComponent(UITransform);
        tapeUT.setContentSize(tapeW, tapeH);
        tapeUT.anchorX = 0.5;
        tapeUT.anchorY = 0;
        tapeNode.setPosition(0, 0, 0);
        this._finishTapeVisualNode = tapeNode;

        // Left pillar
        if (this.finishPillarSpriteFrame) {
            const pillarL = new Node('FinishPillar_Left');
            pillarL.parent = root;
            const sprL = pillarL.addComponent(Sprite);
            sprL.spriteFrame = this.finishPillarSpriteFrame;
            sprL.sizeMode = Sprite.SizeMode.CUSTOM;
            sprL.trim = false;
            const utL = pillarL.addComponent(UITransform);
            utL.setContentSize(tapeW, tapeH);
            utL.anchorX = 0.5;
            utL.anchorY = 0;
            pillarL.setPosition(-this.pillarOffsetX, 0, 0);

            // Right pillar (mirror of left)
            const pillarR = new Node('FinishPillar_Right');
            pillarR.parent = root;
            const sprR = pillarR.addComponent(Sprite);
            sprR.spriteFrame = this.finishPillarSpriteFrame;
            sprR.sizeMode = Sprite.SizeMode.CUSTOM;
            sprR.trim = false;
            const utR = pillarR.addComponent(UITransform);
            utR.setContentSize(tapeW, tapeH);
            utR.anchorX = 0.5;
            utR.anchorY = 0;
            pillarR.setPosition(this.pillarOffsetX, 0, 0);
        }

        this._finishTapeNode = root;
    }

    onEnable() {
        view.on('canvas-resize', this.onResize, this);
    }

    onDisable() {
        view.off('canvas-resize', this.onResize, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
        GameManager.events.off('finish-ready', this.onFinishReady, this);
    }

    /* ─── helpers ─── */

    private cacheViewport() {
        const vs = view.getVisibleSize();
        this._vw = vs.width;
        this._vh = vs.height;
    }

    private onResize() {
        this.cacheViewport();
    }

    private onStateChanged(next: GameState) {
        switch (next) {
            case GameState.RUNNING:
                this._active = true;
                this._postTutorial = false;
                this._preDelayDone = false;
                this._preDelayTimer = 0;
                this._nextPreSpawnDist = 0;
                this._preAlternate = false;
                this._preSpawnCount = 0;
                break;
            case GameState.PLAYING:
                this._active = true;
                this._postTutorial = true;
                // First pyramid spawns after a short distance
                this._nextPyramidDist = PointSpawner.PYRAMID_MIN_DIST * 0.5;
                break;
            case GameState.TUTORIAL:
                this._active = false;
                break;
            case GameState.LOSE:
                this._active = false;
                this.showFailSprite();
                this.clearAllCollectibles();
                break;
            case GameState.WIN:
                // Game finished successfully – stop and remove all remaining collectibles
                this._active = false;
                this.clearAllCollectibles();
                break;
            default:
                this._active = false;
                break;
        }
    }
    /** Show Fail sprite in center with pulse effect, then show gameOver panel */
    private showFailSprite() {
        // Remove previous
        if (this._failNode) {
            this._failNode.destroy();
            this._failNode = null;
        }
        if (!this.failSpriteFrame) return;
        // Create node
        const node = new Node('FailSprite');
        node.parent = this.node.parent || this.node;
        // Center using Widget
        const widget = node.addComponent('cc.Widget');
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        node.setPosition(0, 0, 0);
        // Sprite
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = this.failSpriteFrame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        // Size
        const scale = this.getScale();
        const size = PointSpawner.POINT_SIZE_DESIGN * 3 * scale;
        const ut = node.getComponent(UITransform)!;
        ut.setContentSize(size, size);
        ut.anchorX = 0.5;
        ut.anchorY = 0.5;
        // Start small, grow, then pulse
        node.scale = new Vec3(0.2, 0.2, 1);
        tween(node)
            .to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
            .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
            .repeat(3,
                tween(node)
                    .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
                    .to(0.15, { scale: new Vec3(1, 1, 1) })
            )
            .delay(0.3)
            .call(() => {
                node.destroy();
                this._failNode = null;
                // Show gameOver panel
                if (this.gameOverPanelNode) {
                    this.gameOverPanelNode.active = true;
                }
            })
            .start();
        this._failNode = node;
        // Hide gameOver panel until animation finishes
        if (this.gameOverPanelNode) {
            this.gameOverPanelNode.active = false;
        }
    }

    /** Compute ground Y using the same top-pin logic as PlayerController / ObstacleSpawner. */
    private getPlayerFeetY(): number {
        if (!this.playerNode) return 0;
        const ctrl = this.playerNode.getComponent(PlayerController);
        let y = this.playerNode.position.y;
        if (ctrl && ctrl.isJumping) {
            y = ctrl.groundY;
        }
        return y;
    }

    private getScale(): number {
        return this._vh / PointSpawner.DESIGN_HEIGHT;
    }

    /** Destroy and clear all remaining collectibles (used when game ends) */
    private clearAllCollectibles() {
        for (const col of this._collectibles) {
            if (col && col.node && col.node.isValid) {
                col.node.destroy();
            }
        }
        this._collectibles.length = 0;
    }

    /** Spawn simple confetti around given local position */
    private spawnConfettiAround(center: Vec3) {
        if (!this.confettiSpriteFrame) return;
        const parent = this.node.parent || this.node;
        const count = 20;
        for (let i = 0; i < count; i++) {
            const n = new Node(`Confetti_${i}`);
            n.parent = parent;
            const sprite = n.addComponent(Sprite);
            sprite.spriteFrame = this.confettiSpriteFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            const ut = n.addComponent(UITransform);
            ut.setContentSize(20, 20);
            ut.anchorX = 0.5;
            ut.anchorY = 0.5;
            const startX = center.x + (Math.random() - 0.5) * 80;
            const startY = center.y + Math.random() * 40;
            n.setPosition(startX, startY, 0);

            const duration = 0.8 + Math.random() * 0.6;
            const targetX = startX + (Math.random() - 0.5) * 150;
            const targetY = startY - (100 + Math.random() * 150);
            const angle = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 180);

            tween(n)
                .to(duration, { position: new Vec3(targetX, targetY, 0), angle }, { easing: 'sineIn' })
                .call(() => {
                    n.destroy();
                })
                .start();
        }
    }

    /* ─── spawning ─── */

    private spawnSinglePoint(type: CollectibleType, xPos: number, yPos: number): Collectible {
        const scale = this.getScale();
        const size = PointSpawner.POINT_SIZE_DESIGN * scale;

        const frame = type === CollectibleType.DOLLAR ? this.dollarSpriteFrame : this.paypalSpriteFrame;

        const node = new Node(type === CollectibleType.DOLLAR ? 'Point_Dollar' : 'Point_PayPal');
        node.parent = this.node;

        const sprite = node.addComponent(Sprite);
        if (frame) sprite.spriteFrame = frame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;

        const ut = node.getComponent(UITransform)!;
        let w = size, h = size;
        if (type === CollectibleType.PAYPAL) {
            // Halve height and width for PayPal
            h = size * 0.5;
            w = h * (808 / 551);
        }
        ut.setContentSize(w, h);
        ut.anchorX = 0.5;
        ut.anchorY = 0;

        node.setPosition(xPos, yPos, 0);

        const collectible = node.addComponent(Collectible);
        collectible.type = type;

        this._collectibles.push(collectible);
        return collectible;
    }

    private spawnPreTutorialPoint(xPos: number) {
        if (this._preSpawnCount >= PointSpawner.PRE_TUTORIAL_MAX) return;
        const type = this._preAlternate ? CollectibleType.PAYPAL : CollectibleType.DOLLAR;
        this._preAlternate = !this._preAlternate;
        this._preSpawnCount++;
        // Place at player middle Y
        const feetY = this.getPlayerFeetY();
        const playerH = this._vh * PointSpawner.PLAYER_HEIGHT_RATIO;
        const size = PointSpawner.POINT_SIZE_DESIGN * this.getScale();
        // For PayPal, height is size, width is size * (808/551)
        const h = size;
        const w = type === CollectibleType.PAYPAL ? h * (808 / 551) : h;
        const midY = feetY + playerH / 2 - h / 2;
        this.spawnSinglePoint(type, xPos, midY);
    }

    private spawnPyramid(xPos: number) {
        const scale = this.getScale();
        const gap = PointSpawner.PYRAMID_POINT_GAP * scale;
        const size = PointSpawner.POINT_SIZE_DESIGN * scale;
        const feetY = this.getPlayerFeetY();
        const playerH = this._vh * PointSpawner.PLAYER_HEIGHT_RATIO;

        const height = Math.floor(Math.random() * 4) + 1; // 1 to 4

        // Row step = half player height so:
        //   row 0 center → player middle
        //   row 1 center → player head
        //   row 2+ → above head (need jump)
        const rowStep = playerH / 2;
        const baseY = feetY + playerH / 2 - size / 2; // row 0 bottom-edge Y

        // Hollow pyramid outline (left edge + right edge + apex, no bottom fill)
        // Row r has (height - r) positions; only spawn leftmost and rightmost
        for (let r = 0; r < height; r++) {
            const count = height - r;
            const rowY = baseY + r * rowStep;
            const startX = xPos - ((count - 1) * gap) / 2;
            if (count === 1) {
                // Apex
                const type = Math.random() < 0.5 ? CollectibleType.DOLLAR : CollectibleType.PAYPAL;
                this.spawnSinglePoint(type, startX, rowY);
            } else {
                // Left edge
                const typeL = Math.random() < 0.5 ? CollectibleType.DOLLAR : CollectibleType.PAYPAL;
                this.spawnSinglePoint(typeL, startX, rowY);
                // Right edge
                const typeR = Math.random() < 0.5 ? CollectibleType.DOLLAR : CollectibleType.PAYPAL;
                this.spawnSinglePoint(typeR, startX + (count - 1) * gap, rowY);
            }
        }
    }

    /* ─── collection animation ─── */

    private collectPoint(collectible: Collectible) {
        collectible.collected = true;
        collectible.animating = true;

        const pointValue = collectible.getPointValue();
        const node = collectible.node;

        // Get current world position
        const worldPos = node.getWorldPosition();

        // Get target world position (ScoreContainer)
        let targetWorld = new Vec3();
        if (this.scoreContainerNode) {
            targetWorld = this.scoreContainerNode.getWorldPosition();
        }

        // Convert target to local space of this node's parent (GameLayer)
        const parent = node.parent;
        if (!parent) return;
        const targetLocal = new Vec3();
        const parentUT = parent.getComponent(UITransform);
        if (parentUT) {
            parentUT.convertToNodeSpaceAR(targetWorld, targetLocal);
        }

        const startScale = node.scale.clone();

        tween(node)
            .parallel(
                tween(node).to(PointSpawner.FLY_DURATION,
                    { position: targetLocal },
                    { easing: 'sineIn' }),
                tween(node).to(PointSpawner.FLY_DURATION,
                    { scale: new Vec3(startScale.x * PointSpawner.FLY_END_SCALE, startScale.y * PointSpawner.FLY_END_SCALE, 1) },
                    { easing: 'sineIn' }),
                tween(node).to(PointSpawner.FLY_DURATION,
                    { eulerAngles: new Vec3(0, 0, PointSpawner.FLY_SPIN_DEGREES) }),
            )
            .call(() => {
                // Update score
                if (this.hudManager) {
                    this.hudManager.addScore(pointValue);
                }
                // Play collect sound
                if (this.audioManager) {
                    this.audioManager.playCollect();
                }
                // Remove from tracking
                const idx = this._collectibles.indexOf(collectible);
                if (idx >= 0) this._collectibles.splice(idx, 1);
                node.destroy();
            })
            .start();
    }

    /* ─── update loop ─── */
    private static _tmpPlayerRect = new Rect();
    private static _tmpPointRect = new Rect();

    // Combo praise text logic
    private _praiseNode: Node | null = null;
    private static PRAISE_TEXTS = ["Perfect", "Fantastic", "Great", "Awesome", "Superb", "Excellent", "Nice!"];
    private _comboCount: number = 0;
    private _comboTimer: number = 0;
    private _comboActive: boolean = false;

    update(dt: number) {
        // Collision detection with finish line/tape (finish line scrolls with world via scrollDist)
        if (this._finishTapeNode && !this._finishTapeTriggered && this.playerNode) {
            const tapeUT = this._finishTapeNode.getComponent(UITransform);
            const playerUT = this.playerNode.getComponent(UITransform);
            if (tapeUT && playerUT) {
                const tapeRect = tapeUT.getBoundingBoxToWorld();
                const playerRect = playerUT.getBoundingBoxToWorld();
                if (tapeRect.intersects(playerRect)) {
                    this._finishTapeTriggered = true;

                    // Immediately stop the world by entering WIN state;
                    // background, obstacles, and decorations all pause on WIN.
                    GameManager.instance?.win();

                    const tapeVisualNode = this._finishTapeVisualNode;
                    const mainSprite = tapeVisualNode ? tapeVisualNode.getComponent(Sprite) : null;

                    // Create two halves that will drop after the "cut"
                    const halfLeft = new Node('FinishTape_Left');
                    const halfRight = new Node('FinishTape_Right');
                    halfLeft.parent = this._finishTapeNode;
                    halfRight.parent = this._finishTapeNode;

                    const halfLeftSprite = halfLeft.addComponent(Sprite);
                    const halfRightSprite = halfRight.addComponent(Sprite);
                    if (this.finishTapeSpriteFrame) {
                        halfLeftSprite.spriteFrame = this.finishTapeSpriteFrame;
                        halfRightSprite.spriteFrame = this.finishTapeSpriteFrame;
                    }
                    halfLeftSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    halfRightSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    halfLeftSprite.trim = false;
                    halfRightSprite.trim = false;

                    const leftUT = halfLeft.addComponent(UITransform);
                    const rightUT = halfRight.addComponent(UITransform);
                    const fullW = tapeUT.contentSize.width;
                    const fullH = tapeUT.contentSize.height;
                    const halfW = fullW * 0.5;
                    leftUT.setContentSize(halfW, fullH);
                    rightUT.setContentSize(halfW, fullH);
                    leftUT.anchorX = 1;
                    leftUT.anchorY = 0;
                    rightUT.anchorX = 0;
                    rightUT.anchorY = 0;

                    // Place halves so they overlap the original tape position
                    halfLeft.setPosition(-halfW * 0.5, 0, 0);
                    halfRight.setPosition(halfW * 0.5, 0, 0);

                    if (tapeVisualNode) {
                        tapeVisualNode.active = false;
                    }

                    const dropDistance = 200;
                    const dropDuration = 0.6;

                    tween(halfLeft)
                        .parallel(
                            tween(halfLeft).to(dropDuration, { position: new Vec3(halfLeft.position.x - 80, halfLeft.position.y - dropDistance, 0) }, { easing: 'sineIn' }),
                            tween(halfLeft).to(dropDuration, { angle: -40 }, { easing: 'sineIn' }),
                        )
                        .start();

                    tween(halfRight)
                        .parallel(
                            tween(halfRight).to(dropDuration, { position: new Vec3(halfRight.position.x + 80, halfRight.position.y - dropDistance, 0) }, { easing: 'sineIn' }),
                            tween(halfRight).to(dropDuration, { angle: 40 }, { easing: 'sineIn' }),
                        )
                        .call(() => {
                            // Spawn confetti around the tape position
                            this.spawnConfettiAround(this._finishTapeNode ? this._finishTapeNode.position.clone() : new Vec3(0, 0, 0));
                            if (this._finishTapeNode) {
                                this._finishTapeNode.destroy();
                                this._finishTapeNode = null;
                            }
                        })
                        .start();
                }
            }
        }

        // Handle delayed start of finish phase (allow some extra collectibles after 5th enemy)
        if (this._finishPhaseScheduled && !this._finishPhaseStarted) {
            this._finishPhaseTimer -= dt;
            if (this._finishPhaseTimer <= 0) {
                this.startFinishPhase();
            }
        }

        if (!this._active) return;

        const scale = this.getScale();
        const scrollDist = this.worldScrollSpeed * scale * dt;
        const leftEdge = -this._vw / 2 - 200;
        const SPAWN_BUFFER_FAR = 600;
        const spawnX = this._vw / 2 + SPAWN_BUFFER_FAR;

        // ── pre-tutorial spawning ──
        if (!this._postTutorial) {
            if (!this._preDelayDone) {
                this._preDelayTimer += dt;
                if (this._preDelayTimer >= PointSpawner.PRE_TUTORIAL_DELAY) {
                    this._preDelayDone = true;
                    this._nextPreSpawnDist = 0; // spawn first point immediately
                }
            }

            if (this._preDelayDone && this._preSpawnCount < PointSpawner.PRE_TUTORIAL_MAX) {
                this._nextPreSpawnDist -= scrollDist;
                while (this._nextPreSpawnDist <= 0 && this._preSpawnCount < PointSpawner.PRE_TUTORIAL_MAX) {
                    // For the very first collectible, spawn super close to the right edge
                    const firstSpawnX = (this._preSpawnCount === 0)
                        ? (this._vw / 2 + 60)
                        : spawnX;
                    this.spawnPreTutorialPoint(firstSpawnX);
                    this._nextPreSpawnDist += PointSpawner.PRE_TUTORIAL_SPACING * scale;
                }
            }
        }

        // ── post-tutorial pyramid spawning ──
        if (this._postTutorial) {
            this._nextPyramidDist -= scrollDist;
            if (this._nextPyramidDist <= 0) {
                // Make pyramids rare: match enemy spawn rate
                const widthScale = this._vw / 1280;
                const minD = 2200 * widthScale; // much rarer
                const maxD = 3200 * widthScale;
                // Increase pyramid spawn offset farther right
                const pyramidOffset = 700 * widthScale;
                this.spawnPyramid(spawnX + pyramidOffset);
                this._nextPyramidDist = minD + Math.random() * (maxD - minD);
            }
        }

        // ── move finish line with world ──
        if (this._finishTapeNode) {
            const pos = this._finishTapeNode.position;
            this._finishTapeNode.setPosition(pos.x - scrollDist, pos.y, 0);
        }

        // ── move & cull ──
        for (let i = this._collectibles.length - 1; i >= 0; i--) {
            const col = this._collectibles[i];
            if (col.animating) continue; // don't scroll during fly animation

            const pos = col.node.position;
            const newX = pos.x - scrollDist;
            col.node.setPosition(newX, pos.y, 0);

            if (newX < leftEdge) {
                col.node.destroy();
                this._collectibles.splice(i, 1);
            }
        }

        // ── collision detection ──
        this.checkCollisions();

        // Combo timer logic
        if (this._comboTimer > 0) {
            this._comboTimer -= dt;
            if (this._comboTimer <= 0) {
                this._comboCount = 0;
                this._comboActive = false;
            }
        }
    }

    // Praise text display
    private showPraiseText() {
        if (!this.playerNode) return;
        // Remove previous
        if (this._praiseNode) {
            this._praiseNode.destroy();
            this._praiseNode = null;
        }
        // Pick random text
        const text = PointSpawner.PRAISE_TEXTS[Math.floor(Math.random() * PointSpawner.PRAISE_TEXTS.length)];
        const node = new Node("PraiseText");
        node.parent = this.node.parent || this.node;
        // Position at the exact center of the device using Widget
        const widget = node.addComponent('cc.Widget');
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        node.setPosition(0, 0, 0);
        // Add label
        const label = node.addComponent(Label);
        label.string = text;
        // Landscape view: halve text size
        let fontSize = 144;
        let lineHeight = 150;
        if (this._vw > this._vh) { // landscape
            fontSize = 72;
            lineHeight = 75;
        }
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        // Slight rotation
        node.angle = -10;
        // Outline
        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(0, 0, 0, 255);
        outline.width = 5; // 5px black outline
        // Shadow
        const shadow = node.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 180);
        shadow.offset = new Vec2(0, -2);
        shadow.blur = 3;
        // Fade out after 2s (use label color alpha)
        tween(label)
            .delay(2)
            .to(0.3, { color: new Color(255, 255, 255, 0) })
            .call(() => { node.destroy(); this._praiseNode = null; })
            .start();
        this._praiseNode = node;
    }

    // Collision detection
    private checkCollisions() {
        if (!this.playerNode) return;

        const playerUT = this.playerNode.getComponent(UITransform);
        if (!playerUT) return;

        const pp = this.playerNode.position;
        const pw = playerUT.contentSize.width * PointSpawner.HITBOX_SHRINK;
        const ph = playerUT.contentSize.height * PointSpawner.HITBOX_SHRINK;
        const pOffX = (playerUT.contentSize.width - pw) / 2;
        const pOffY = (playerUT.contentSize.height - ph) / 2;
        const playerRect = PointSpawner._tmpPlayerRect;
        playerRect.x = pp.x - playerUT.contentSize.width / 2 + pOffX;
        playerRect.y = pp.y + pOffY;
        playerRect.width = pw;
        playerRect.height = ph;

        for (const col of this._collectibles) {
            if (col.collected) continue;

            const oUT = col.node.getComponent(UITransform);
            if (!oUT) continue;

            const op = col.node.position;
            const ow = oUT.contentSize.width * PointSpawner.HITBOX_SHRINK;
            const oh = oUT.contentSize.height * PointSpawner.HITBOX_SHRINK;
            const oOffX = (oUT.contentSize.width - ow) / 2;
            const oOffY = (oUT.contentSize.height - oh) / 2;
            const pointRect = PointSpawner._tmpPointRect;
            pointRect.x = op.x - oUT.contentSize.width / 2 + oOffX;
            pointRect.y = op.y + oOffY;
            pointRect.width = ow;
            pointRect.height = oh;

            if (PointSpawner.rectsOverlap(playerRect, pointRect)) {
                this.collectPoint(col);
                // Combo logic: show praise text if combo
                if (!this._comboActive) {
                    this._comboCount++;
                    this._comboTimer = 2.0;
                    if (this._comboCount >= 2) {
                        this.showPraiseText();
                        this._comboActive = true;
                    }
                }
            }
        }
    }

    private static rectsOverlap(a: Rect, b: Rect): boolean {
        return a.x < b.x + b.width
            && a.x + a.width > b.x
            && a.y < b.y + b.height
            && a.y + a.height > b.y;
    }
}
