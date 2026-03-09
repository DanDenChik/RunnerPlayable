import { _decorator, Component, UITransform, Sprite, view, Size, Node, instantiate, Widget } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/** Scrolls background with seamless looping using two copies side by side */
@ccclass('BackgroundScroller')
export class BackgroundScroller extends Component {

    @property({ tooltip: 'Scroll speed in pixels per second' })
    speed: number = 300;

    private _scrolling: boolean = false;
    private _originalSize: Size = new Size(0, 0);
    private _clone: Node | null = null;
    /** Current width of one background panel */
    private _panelW: number = 0;
    /** Prevents the clone from recursively spawning another clone */
    private static _isCloning = false;

    onLoad() {
        // If this instance lives on a clone, skip cloning logic entirely
        if (BackgroundScroller._isCloning) return;

        const ut = this.getComponent(UITransform);
        if (ut) {
            this._originalSize.set(ut.contentSize);
        }

        // Create a second copy for seamless looping (mirrored horizontally)
        BackgroundScroller._isCloning = true;
        this._clone = instantiate(this.node);
        BackgroundScroller._isCloning = false;

        this._clone.name = 'Background_Clone';
        // Remove BackgroundScroller from clone to avoid double logic
        const cloneScroller = this._clone.getComponent(BackgroundScroller);
        if (cloneScroller) cloneScroller.destroy();
        // Remove Widget from clone so it doesn't fight with manual positioning
        const cloneWidget = this._clone.getComponent(Widget);
        if (cloneWidget) cloneWidget.destroy();

        this._clone.parent = this.node.parent;
        this._clone.setSiblingIndex(this.node.getSiblingIndex() + 1);
        // Flip clone horizontally for normal→mirrored→normal pattern
        this._clone.setScale(-1, 1, 1);

        this.ensureFullViewport();
        GameManager.events.on('state-changed', this.onStateChanged, this);
    }

    onEnable() {
        view.on('canvas-resize', this.ensureFullViewport, this);
    }

    onDisable() {
        view.off('canvas-resize', this.ensureFullViewport, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
    }

    /** Scale both panels to cover the viewport, then position clone to the right */
    private ensureFullViewport() {
        const ut = this.getComponent(UITransform);
        if (!ut) return;

        const visibleSize = view.getVisibleSize();
        const vw = visibleSize.width;
        const vh = visibleSize.height;

        let origW = this._originalSize.width;
        let origH = this._originalSize.height;

        if (origW <= 0 || origH <= 0) {
            const sprite = this.getComponent(Sprite);
            if (sprite && sprite.spriteFrame) {
                const rect = sprite.spriteFrame.rect;
                origW = rect.width;
                origH = rect.height;
            }
        }

        if (origW <= 0 || origH <= 0) {
            ut.setContentSize(vw, vh);
            this._panelW = vw;
        } else {
            const scale = Math.max(vw / origW, vh / origH);
            const newW = origW * scale;
            const newH = origH * scale;
            ut.setContentSize(newW, newH);
            this._panelW = newW;
        }

        // Apply same size to clone
        if (this._clone) {
            const cloneUt = this._clone.getComponent(UITransform);
            if (cloneUt) {
                cloneUt.setContentSize(this._panelW, ut.contentSize.height);
            }
        }

        // Reset positions: main at 0, clone right next to it
        this.node.setPosition(0, 0, 0);
        if (this._clone) {
            this._clone.setPosition(this._panelW, 0, 0);
        }
    }

    private onStateChanged(next: GameState) {
        this._scrolling = next === GameState.RUNNING || next === GameState.PLAYING;
    }

    update(dt: number) {
        if (!this._scrolling || !this._clone) return;

        const vh = view.getVisibleSize().height;
        const scale = vh / 720;
        const dx = this.speed * scale * dt;

        // Move both panels left
        const pos = this.node.position;
        const clonePos = this._clone.position;
        this.node.setPosition(pos.x - dx, pos.y, 0);
        this._clone.setPosition(clonePos.x - dx, clonePos.y, 0);

        // Wrap: if a panel is fully offscreen left, teleport it to the right of the other
        // After wrap, alternate the scale: the panel that moves right gets opposite scaleX
        if (pos.x - dx + this._panelW / 2 <= -this._panelW / 2) {
            this.node.setPosition(this._clone.position.x + this._panelW, 0, 0);
            // Flip to opposite of clone
            const cloneScaleX = this._clone.scale.x;
            this.node.setScale(-cloneScaleX, 1, 1);
        }
        if (clonePos.x - dx + this._panelW / 2 <= -this._panelW / 2) {
            this._clone.setPosition(this.node.position.x + this._panelW, 0, 0);
            const mainScaleX = this.node.scale.x;
            this._clone.setScale(-mainScaleX, 1, 1);
        }
    }
}
