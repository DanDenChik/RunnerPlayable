import { _decorator, Component, Node, SpriteFrame, Sprite, UITransform, view, Vec3, Widget } from 'cc';
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
 * Place template children (named tree*, bush*, streetlight*) in the editor.
 * On load, their SpriteFrames are harvested and the templates destroyed.
 */
@ccclass('DecorationScroller')
export class DecorationScroller extends Component {

    @property({ tooltip: 'Scroll speed in px/s (should match BackgroundScroller)' })
    speed: number = 600;

    @property({ group: { name: 'Tree' }, tooltip: 'Min distance (px) between trees' })
    treeMinDist: number = 800;

    @property({ group: { name: 'Tree' }, tooltip: 'Max distance (px) between trees' })
    treeMaxDist: number = 1600;

    @property({ group: { name: 'Bush' }, tooltip: 'Min distance (px) between bushes' })
    bushMinDist: number = 500;

    @property({ group: { name: 'Bush' }, tooltip: 'Max distance (px) between bushes' })
    bushMaxDist: number = 1200;

    @property({ group: { name: 'Streetlight' }, tooltip: 'Min distance (px) between streetlights' })
    lampMinDist: number = 900;

    @property({ group: { name: 'Streetlight' }, tooltip: 'Max distance (px) between streetlights' })
    lampMaxDist: number = 1800;

    private readonly LAYER_HEIGHT_RATIO = 383 / 720;

    private readonly HEIGHT_TREE = 1.0;
    private readonly HEIGHT_LAMP = 357 / 382;
    private readonly HEIGHT_BUSH = 96 / 382;

    private _scrolling = false;
    private _instances: DecoInstance[] = [];
    private _configs: DecoConfig[] = [];
    /** Map from DecoType to all configs of that type */
    private _configsByType = new Map<DecoType, DecoConfig[]>();
    /** Total distance scrolled since last rebuild */
    private _distScrolled = 0;
    /** Distance at which the next decoration of each type should spawn */
    private _nextSpawnDist = new Map<DecoType, number>();
    private _vh = 720;
    private _vw = 1280;

    onLoad() {
        this.updateLayerSize();
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

    /** Harvest SpriteFrames from editor-placed template children, then destroy them */
    private buildConfigs() {
        this._configs = [];

        // Collect children before destroying
        const templates = [...this.node.children];

        for (const child of templates) {
            const sprite = child.getComponent(Sprite);
            if (!sprite || !sprite.spriteFrame) continue;

            const frame = sprite.spriteFrame;
            const r = frame.rect;
            const name = child.name.toLowerCase();

            let type: DecoType;
            let heightRatio: number;
            if (name.startsWith('tree')) {
                type = DecoType.TREE;
                heightRatio = this.HEIGHT_TREE;
            } else if (name.startsWith('bush')) {
                type = DecoType.BUSH;
                heightRatio = this.HEIGHT_BUSH;
            } else if (name.startsWith('streetlight') || name.startsWith('lamp')) {
                type = DecoType.LAMP;
                heightRatio = this.HEIGHT_LAMP;
            } else {
                continue;
            }

            this._configs.push({
                type,
                heightRatio,
                aspect: r.width / r.height,
                frame,
            });

            child.destroy();
        }
    }

    /** Tear down existing instances and regenerate for current viewport */
    private rebuildAll() {
        for (const inst of this._instances) inst.node.destroy();
        this._instances = [];
        this._nextSpawnDist.clear();
        this._distScrolled = 0;

        const vs = view.getVisibleSize();
        this._vw = vs.width;
        this._vh = vs.height;

        if (this._configs.length === 0) return;

        // Group configs by type
        this._configsByType.clear();
        for (const c of this._configs) {
            let arr = this._configsByType.get(c.type);
            if (!arr) { arr = []; this._configsByType.set(c.type, arr); }
            arr.push(c);
        }

        const widthScale = this._vw / 1280;
        const buffer = 300 * widthScale;
        const startX = -this._vw / 2 - buffer;
        const endX = this._vw / 2 + buffer;

        // For each type, independently place decorations from left to right
        for (const [type, configs] of this._configsByType) {
            const { min, max } = this.getDistRange(type);
            const minD = min * widthScale;
            const maxD = max * widthScale;

            // First decoration with a small random offset
            let x = startX + Math.random() * minD;
            while (x < endX) {
                const config = configs[Math.floor(Math.random() * configs.length)];
                const inst = this.spawnDecoration(config, x);
                this._instances.push(inst);

                // Next spawn at random distance between min and max
                x += minD + Math.random() * (maxD - minD);
            }

            // Distance from right edge to next spawn for this type
            // x is past endX, so the overshoot is how far we need to scroll before spawning again
            this._nextSpawnDist.set(type, x - endX);
        }
    }

    /** Get min/max distance for a decoration type */
    private getDistRange(type: DecoType): { min: number; max: number } {
        switch (type) {
            case DecoType.TREE:  return { min: this.treeMinDist, max: this.treeMaxDist };
            case DecoType.BUSH:  return { min: this.bushMinDist, max: this.bushMaxDist };
            case DecoType.LAMP:  return { min: this.lampMinDist, max: this.lampMaxDist };
        }
    }

    private spawnDecoration(config: DecoConfig, xPos: number): DecoInstance {
        const node = new Node(`Deco_${DecoType[config.type]}`);
        node.parent = this.node;

        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = config.frame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const ut = node.getComponent(UITransform)!;
        const layerH = this.getLayerHeight();
        const h = layerH * config.heightRatio;
        const w = h * config.aspect;
        ut.setContentSize(w, h);
        ut.anchorX = 0.5;
        ut.anchorY = 0; // bottom anchor

        // With anchorY=1 on the layer, Y=0 is top, Y=-layerH is bottom.
        // Place decoration bottoms at the layer bottom.
        node.setPosition(xPos, -layerH, 0);

        return { node, config };
    }

    private onResize() {
        this.updateLayerSize();
        this.rebuildAll();
    }

    /** Resize this node's UITransform to at least 50% (or 383/720) of viewport height, pinned to top */
    private updateLayerSize() {
        const vs = view.getVisibleSize();
        const layerH = vs.height * this.LAYER_HEIGHT_RATIO;

        const ut = this.getComponent(UITransform);
        if (ut) {
            ut.setContentSize(vs.width, layerH);
            ut.anchorY = 1; // top anchor
        }

        // Pin top edge to device top
        let w = this.getComponent(Widget);
        if (!w) w = this.node.addComponent(Widget);
        w.isAlignTop = true;
        w.isAlignBottom = false;
        w.isAlignLeft = true;
        w.isAlignRight = true;
        w.top = 0;
        w.left = 0;
        w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();
    }

    /** Get the current layer height in pixels */
    private getLayerHeight(): number {
        const vs = view.getVisibleSize();
        return vs.height * this.LAYER_HEIGHT_RATIO;
    }

    private onStateChanged(next: GameState) {
        this._scrolling = next === GameState.RUNNING || next === GameState.PLAYING;
    }

    update(dt: number) {
        if (!this._scrolling) return;

        const vh = view.getVisibleSize().height;
        const scale = vh / 720;
        const scrollDist = this.speed * scale * dt;
        const leftEdge = -this._vw / 2 - 400;
        const rightEdge = this._vw + 600;

        // Move all decorations left
        for (let i = this._instances.length - 1; i >= 0; i--) {
            const inst = this._instances[i];
            const pos = inst.node.position;
            const ut = inst.node.getComponent(UITransform);
            const halfW = ut ? ut.contentSize.width / 2 : 0;
            const newX = pos.x - scrollDist;
            inst.node.setPosition(newX, pos.y, 0);

            // Remove if scrolled past left edge
            if (newX + halfW < leftEdge) {
                inst.node.destroy();
                this._instances.splice(i, 1);
            }
        }

        // Spawn new decorations on the right if needed
        this.trySpawnRight(rightEdge, scrollDist);
    }

    /** Spawn new decorations at the right edge when enough distance has been scrolled */
    private trySpawnRight(rightEdge: number, scrollDist: number) {
        const widthScale = this._vw / 1280;

        for (const [type, configs] of this._configsByType) {
            let remaining = this._nextSpawnDist.get(type);
            if (remaining === undefined) continue;

            // Reduce remaining distance by how far we scrolled this frame
            remaining -= scrollDist;
            if (remaining > 0) {
                this._nextSpawnDist.set(type, remaining);
                continue;
            }

            const config = configs[Math.floor(Math.random() * configs.length)];
            const inst = this.spawnDecoration(config, rightEdge);
            this._instances.push(inst);

            // Schedule next spawn for this type
            const { min, max } = this.getDistRange(type);
            const minD = min * widthScale;
            const maxD = max * widthScale;
            this._nextSpawnDist.set(type, minD + Math.random() * (maxD - minD));
        }
    }
}
