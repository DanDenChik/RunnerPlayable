import { _decorator, Component, Node, SpriteFrame, Sprite, UITransform, view, Vec3 } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/** Decoration type definitions with height ratios relative to viewport */
enum DecoType { TREE, BUSH, LAMP }

interface DecoConfig {
    type: DecoType;
    /** Height as fraction of viewport height */
    heightRatio: number;
    /** Original aspect ratio (w/h) from the source texture */
    aspect: number;
    frame: SpriteFrame;
}

interface DecoInstance {
    node: Node;
    config: DecoConfig;
}

/**
 * Procedurally spawns and scrolls decoration sprites (trees, bushes, streetlights).
 * Attach to a node that is a child of Canvas, between Background and GameLayer.
 */
@ccclass('DecorationScroller')
export class DecorationScroller extends Component {

    @property({ type: [SpriteFrame], tooltip: 'Tree sprite frames (tree.png, tree2.png)' })
    treeFrames: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: 'Bush sprite frames (bush.png, bush2.png, bush3.png)' })
    bushFrames: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: 'Streetlight sprite frames' })
    lampFrames: SpriteFrame[] = [];

    @property({ tooltip: 'Scroll speed in px/s (should match BackgroundScroller)' })
    speed: number = 600;

    @property({ tooltip: 'Min distance (px) between same decoration type' })
    minSameTypeGap: number = 400;

    @property({ tooltip: 'Min distance (px) between any two decorations' })
    minAnyGap: number = 120;

    /** Bottom of decorations sits at this fraction of viewport height from the bottom */
    private readonly BASELINE_RATIO = 0.45;

    /** Height ratios for each type */
    private readonly HEIGHT_TREE = 0.55;
    private readonly HEIGHT_BUSH = 0.10;
    private readonly HEIGHT_LAMP = 0.40;

    private _scrolling = false;
    private _instances: DecoInstance[] = [];
    private _configs: DecoConfig[] = [];
    private _vh = 720;
    private _vw = 1280;

    onLoad() {
        this.buildConfigs();
        this.rebuildAll();
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

    private buildConfigs() {
        this._configs = [];
        for (const f of this.treeFrames) {
            if (!f) continue;
            const r = f.rect;
            this._configs.push({ type: DecoType.TREE, heightRatio: this.HEIGHT_TREE, aspect: r.width / r.height, frame: f });
        }
        for (const f of this.bushFrames) {
            if (!f) continue;
            const r = f.rect;
            this._configs.push({ type: DecoType.BUSH, heightRatio: this.HEIGHT_BUSH, aspect: r.width / r.height, frame: f });
        }
        for (const f of this.lampFrames) {
            if (!f) continue;
            const r = f.rect;
            this._configs.push({ type: DecoType.LAMP, heightRatio: this.HEIGHT_LAMP, aspect: r.width / r.height, frame: f });
        }
    }

    /** Tear down existing instances and regenerate for current viewport */
    private rebuildAll() {
        for (const inst of this._instances) inst.node.destroy();
        this._instances = [];

        const vs = view.getVisibleSize();
        this._vw = vs.width;
        this._vh = vs.height;

        if (this._configs.length === 0) return;

        // Fill from left edge - buffer to right edge + buffer
        const buffer = 300;
        const startX = -this._vw / 2 - buffer;
        const endX = this._vw / 2 + buffer;

        // Track last X per decoration type for the gap constraint
        const lastXByType = new Map<DecoType, number>();

        let x = startX + Math.random() * 60;
        while (x < endX) {
            // Pick a random config that satisfies the same-type gap
            const candidates = this._configs.filter(c => {
                const lastX = lastXByType.get(c.type);
                return lastX === undefined || (x - lastX) >= this.minSameTypeGap;
            });
            if (candidates.length === 0) {
                // All types too close — advance a bit
                x += 80;
                continue;
            }
            const config = candidates[Math.floor(Math.random() * candidates.length)];
            const inst = this.spawnDecoration(config, x);
            this._instances.push(inst);
            lastXByType.set(config.type, x);

            // Random gap to next decoration
            x += this.minAnyGap + Math.random() * 200;
        }
    }

    private spawnDecoration(config: DecoConfig, xPos: number): DecoInstance {
        const node = new Node(`Deco_${DecoType[config.type]}`);
        node.parent = this.node;

        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = config.frame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const ut = node.getComponent(UITransform)!;
        const h = this._vh * config.heightRatio;
        const w = h * config.aspect;
        ut.setContentSize(w, h);
        ut.anchorX = 0.5;
        ut.anchorY = 0; // bottom anchor

        // Y: bottom of decoration at baseline (45% from bottom)
        const baseY = -this._vh / 2 + this._vh * this.BASELINE_RATIO;
        node.setPosition(xPos, baseY, 0);

        return { node, config };
    }

    private onResize() {
        this.rebuildAll();
    }

    private onStateChanged(next: GameState) {
        this._scrolling = next === GameState.RUNNING || next === GameState.PLAYING;
    }

    update(dt: number) {
        if (!this._scrolling) return;

        const leftEdge = -this._vw / 2 - 400;
        const rightEdge = this._vw / 2 + 400;

        // Move all decorations left
        for (let i = this._instances.length - 1; i >= 0; i--) {
            const inst = this._instances[i];
            const pos = inst.node.position;
            const ut = inst.node.getComponent(UITransform);
            const halfW = ut ? ut.contentSize.width / 2 : 0;
            const newX = pos.x - this.speed * dt;
            inst.node.setPosition(newX, pos.y, 0);

            // Remove if scrolled past left edge
            if (newX + halfW < leftEdge) {
                inst.node.destroy();
                this._instances.splice(i, 1);
            }
        }

        // Spawn new decorations on the right if needed
        this.trySpawnRight(rightEdge);
    }

    /** Spawn a new decoration at the right edge if there's enough gap */
    private trySpawnRight(rightEdge: number) {
        // Find rightmost decoration
        let maxX = -Infinity;
        const lastXByType = new Map<DecoType, number>();

        for (const inst of this._instances) {
            const x = inst.node.position.x;
            if (x > maxX) maxX = x;
            const prev = lastXByType.get(inst.config.type);
            if (prev === undefined || x > prev) {
                lastXByType.set(inst.config.type, x);
            }
        }

        // Only spawn if far enough from the rightmost decoration
        const spawnX = rightEdge;
        if (maxX !== -Infinity && (spawnX - maxX) < this.minAnyGap) return;

        // Pick a random config that satisfies the same-type gap
        const candidates = this._configs.filter(c => {
            const lastX = lastXByType.get(c.type);
            return lastX === undefined || (spawnX - lastX) >= this.minSameTypeGap;
        });
        if (candidates.length === 0) return;

        const config = candidates[Math.floor(Math.random() * candidates.length)];
        const inst = this.spawnDecoration(config, spawnX);
        this._instances.push(inst);
    }
}
