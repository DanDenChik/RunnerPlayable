import { _decorator, Component, Node, SpriteFrame, Sprite, UITransform, view, Color, Rect, Vec3, Widget, AnimationClip, Animation } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';
import { Obstacle, ObstacleType } from './Obstacle';
import { HudManager } from '../ui/HudManager';
import { PlayerController } from '../player/PlayerController';

const { ccclass, property } = _decorator;

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {

    @property({ type: Node, tooltip: 'Reference to the Player node' })
    playerNode: Node | null = null;

    @property({ type: HudManager, tooltip: 'Reference to HudManager for health updates' })
    hudManager: HudManager | null = null;

    @property({ type: SpriteFrame, tooltip: 'SpriteFrame for non-movable obstacles (obs1.webp)' })
    nonMovableSpriteFrame: SpriteFrame | null = null;

    @property({ type: AnimationClip, tooltip: 'Animation clip for movable enemy (enemy.anim)' })
    movableAnimClip: AnimationClip | null = null;

    @property({ tooltip: 'World scroll speed in px/s (match DecorationScroller)' })
    worldScrollSpeed: number = 600;

    @property({ tooltip: 'Extra speed for movable obstacles in px/s' })
    movableOwnSpeed: number = 100;

    @property({ tooltip: 'Seconds between obstacle spawns' })
    spawnInterval: number = 5;

    /* ─── constants ─── */

    private static readonly PLAYER_HEIGHT_RATIO = 150 / 720;
    private static readonly LAYER_HEIGHT_RATIO = 383 / 720;
    private static readonly MIN_LAYER_HEIGHT_RATIO = 0.5;
    /** Non-movable is 50 % of MC height */
    private static readonly NON_MOVABLE_SCALE = 0.5;
    /** Buffer px past the right edge for spawning */
    private static readonly SPAWN_BUFFER = 100;
    /** Shrink collision boxes to 60 % of visual size for forgiving hits */
    private static readonly HITBOX_SHRINK = 0.6;

    private static readonly DESIGN_HEIGHT = 720;

    /* ─── runtime state ─── */

    private _active = false;
    private _timeSinceSpawn = 0;
    private _nextIsMovable = true;
    private _obstacles: Obstacle[] = [];
    private _vw = 1280;
    private _vh = 720;
    private _tutorialTriggered = false;
    private _totalSpawned = 0;
    private _totalPassed = 0;

    private static readonly MAX_OBSTACLES = 5;

    /** Trigger tutorial this many seconds before the first obstacle reaches the player */
    private static readonly TUTORIAL_TRIGGER_SECONDS = 0.4;

    /* ─── lifecycle ─── */

    onLoad() {
        this.cacheViewport();
        GameManager.events.on('state-changed', this.onStateChanged, this);
    }

    onEnable() {
        view.on('canvas-resize', this.onResize, this);
    }

    onDisable() {
        view.off('canvas-resize', this.onResize, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
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
        this._active = next === GameState.RUNNING || next === GameState.PLAYING;
    }

    /* ─── spawning ─── */

    private spawnObstacle() {
        const isMovable = this._nextIsMovable;
        this._nextIsMovable = !this._nextIsMovable;

        const playerH = this._vh * ObstacleSpawner.PLAYER_HEIGHT_RATIO;
        const h = isMovable ? playerH : playerH * ObstacleSpawner.NON_MOVABLE_SCALE;

        // Determine aspect ratio from sprite frame (default 1:1 for dummy)
        let aspect = 1;
        if (!isMovable && this.nonMovableSpriteFrame) {
            const r = this.nonMovableSpriteFrame.rect;
            aspect = r.width / r.height;
        }
        const w = isMovable ? (h * aspect) * 0.7 : (h * aspect);

        // Create node
        const node = new Node(isMovable ? 'Obs_Movable' : 'Obs_NonMovable');
        node.parent = this.node;

        // Sprite
        const sprite = node.addComponent(Sprite);
        if (!isMovable && this.nonMovableSpriteFrame) {
            sprite.spriteFrame = this.nonMovableSpriteFrame;
        }
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;

        // Movable enemy: attach animation clip and play it in a loop
        if (isMovable && this.movableAnimClip) {
            const anim = node.addComponent(Animation);
            anim.addClip(this.movableAnimClip);
            const state = anim.getState(this.movableAnimClip.name);
            if (state) state.wrapMode = AnimationClip.WrapMode.Loop;
            anim.play(this.movableAnimClip.name);
        } else if (isMovable) {
            // Fallback dummy red tint when no animation assigned
            sprite.color = new Color(255, 80, 80, 255);
        }

        // UITransform
        const ut = node.getComponent(UITransform)!;
        ut.setContentSize(w, h);
        ut.anchorX = 0.5;
        ut.anchorY = 0; // bottom-aligned

        // Mirror movable enemies so their animation faces left (toward the player)
        if (isMovable) {
            node.setScale(-1, 1, 1);
        }

        // Position: spawn off-screen right, same Y as player feet
        const spawnX = this._vw / 2 + ObstacleSpawner.SPAWN_BUFFER;
        const feetY = this.getPlayerFeetY();
        node.setPosition(spawnX, feetY, 0);

        // Obstacle component
        const obs = node.addComponent(Obstacle);
        obs.type = isMovable ? ObstacleType.MOVABLE : ObstacleType.NON_MOVABLE;
        obs.ownSpeed = isMovable ? this.movableOwnSpeed : 0;

        this._obstacles.push(obs);
    }

    /** Compute ground Y using the same top-pin logic as PlayerController. */
    private getPlayerFeetY(): number {
        const vs = view.getVisibleSize();
        const vh = vs.height;
        const ratio = Math.max(ObstacleSpawner.LAYER_HEIGHT_RATIO, ObstacleSpawner.MIN_LAYER_HEIGHT_RATIO);
        const topValue = vh * ratio;
        // Canvas anchor is center → top edge is vh/2.
        // Widget top = topValue means node top edge is at  vh/2 - topValue.
        // With anchorY=0 the node position equals its bottom edge, so Y = top - height.
        // But Widget sets position directly: y = vh/2 - topValue  (for anchorY=0 the widget places the node so its top is there, meaning pos.y = topEdge already accounts for anchor internally).
        // Replicate what Widget does: parent height = vh (Canvas), anchorY of parent = 0.5
        // widgetTop means distance from parent top → nodeWorldY_top = vh/2 - topValue
        // For anchorY=0 node, position.y = nodeWorldY_top - contentHeight... but Widget adjusts for anchor.
        // Simplest: read the player's _groundY if jumping, else current Y.
        if (!this.playerNode) return 0;
        const ctrl = this.playerNode.getComponent(PlayerController);
        if (ctrl && ctrl.isJumping) {
            return ctrl.groundY;
        }
        return this.playerNode.position.y;
    }

    /* ─── update loop ─── */

    private static _tmpPlayerRect = new Rect();
    private static _tmpObsRect = new Rect();

    update(dt: number) {
        if (!this._active) return;

        // ── spawn timer ──
        this._timeSinceSpawn += dt;
        if (this._timeSinceSpawn >= this.spawnInterval && this._totalSpawned < ObstacleSpawner.MAX_OBSTACLES) {
            this._timeSinceSpawn -= this.spawnInterval;
            this.spawnObstacle();
            this._totalSpawned++;
        }

        const vh = view.getVisibleSize().height;
        const scale = vh / ObstacleSpawner.DESIGN_HEIGHT;
        const scrollDist = this.worldScrollSpeed * scale * dt;
        const leftEdge = -this._vw / 2 - 400;

        // ── move & cull ──
        for (let i = this._obstacles.length - 1; i >= 0; i--) {
            const obs = this._obstacles[i];
            const pos = obs.node.position;
            const extra = obs.ownSpeed * scale * dt;
            const newX = pos.x - scrollDist - extra;
            obs.node.setPosition(newX, pos.y, 0);

            if (newX < leftEdge) {
                obs.node.destroy();
                this._obstacles.splice(i, 1);
                this._totalPassed++;
                if (this._totalPassed === ObstacleSpawner.MAX_OBSTACLES) {
                    // Emit finish-ready event
                    GameManager.events.emit('finish-ready');
                }
            }
        }

        // ── tutorial trigger: pause when first obstacle is ~2 seconds from player ──
        if (!this._tutorialTriggered && this._obstacles.length > 0 && this.playerNode) {
            const first = this._obstacles[0];
            const closingSpeed = (this.worldScrollSpeed + first.ownSpeed) * scale;
            const triggerDist = closingSpeed * ObstacleSpawner.TUTORIAL_TRIGGER_SECONDS;
            const dist = first.node.position.x - this.playerNode.position.x;
            if (dist < triggerDist) {
                this._tutorialTriggered = true;
                GameManager.instance?.enterTutorial();
                return; // skip collision check this frame
            }
        }

        // ── collision ──
        this.checkCollisions();
    }

    private checkCollisions() {
        if (!this.playerNode) return;

        // Skip collision check while player is invincible or jumping
        const playerCtrl = this.playerNode.getComponent(PlayerController);
        if (playerCtrl && (playerCtrl.isInvincible || playerCtrl.isJumping)) return;

        const playerUT = this.playerNode.getComponent(UITransform);
        if (!playerUT) return;

        // Build player AABB (local space of GameLayer — same parent)
        const pp = this.playerNode.position;
        const pw = playerUT.contentSize.width * ObstacleSpawner.HITBOX_SHRINK;
        const ph = playerUT.contentSize.height * ObstacleSpawner.HITBOX_SHRINK;
        const pOffX = (playerUT.contentSize.width - pw) / 2;
        const pOffY = (playerUT.contentSize.height - ph) / 2;
        const playerRect = ObstacleSpawner._tmpPlayerRect;
        // anchorY=0 → bottom at pp.y, anchorX=0.5 → left at pp.x - fullW/2
        playerRect.x = pp.x - playerUT.contentSize.width / 2 + pOffX;
        playerRect.y = pp.y + pOffY;
        playerRect.width = pw;
        playerRect.height = ph;

        for (const obs of this._obstacles) {
            if (obs.hit) continue;

            const oUT = obs.node.getComponent(UITransform);
            if (!oUT) continue;

            const op = obs.node.position;
            const ow = oUT.contentSize.width * ObstacleSpawner.HITBOX_SHRINK;
            const oh = oUT.contentSize.height * ObstacleSpawner.HITBOX_SHRINK;
            const oOffX = (oUT.contentSize.width - ow) / 2;
            const oOffY = (oUT.contentSize.height - oh) / 2;
            const obsRect = ObstacleSpawner._tmpObsRect;
            obsRect.x = op.x - oUT.contentSize.width / 2 + oOffX;
            obsRect.y = op.y + oOffY;
            obsRect.width = ow;
            obsRect.height = oh;

            if (this.rectsOverlap(playerRect, obsRect)) {
                obs.hit = true;
                this.onPlayerHit();
            }
        }
    }

    private rectsOverlap(a: Rect, b: Rect): boolean {
        return a.x < b.x + b.width
            && a.x + a.width > b.x
            && a.y < b.y + b.height
            && a.y + a.height > b.y;
    }

    private onPlayerHit() {
        // Notify player for invincibility / flash
        GameManager.events.emit('player-damaged');

        // Update health HUD
        if (this.hudManager) {
            this.hudManager.damage();

            // Check death
            if (this.hudManager.healthDisplay && this.hudManager.healthDisplay.currentHealth <= 0) {
                GameManager.instance?.lose();
            }
        }
    }
}
