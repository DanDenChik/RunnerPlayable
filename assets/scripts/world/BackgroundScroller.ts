import { _decorator, Component, UITransform, Sprite, view, Size } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/** Scrolls background and ensures it fills the viewport while keeping aspect ratio */
@ccclass('BackgroundScroller')
export class BackgroundScroller extends Component {

    @property({ tooltip: 'Scroll speed in pixels per second' })
    speed: number = 300;

    private _scrolling: boolean = false;
    private _originalSize: Size = new Size(0, 0);

    onLoad() {
        // Store original content size as the reference aspect ratio
        const ut = this.getComponent(UITransform);
        if (ut) {
            this._originalSize.set(ut.contentSize);
        }
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

    /** Scale node to cover the entire viewport while preserving aspect ratio */
    private ensureFullViewport() {
        const ut = this.getComponent(UITransform);
        if (!ut) return;

        const visibleSize = view.getVisibleSize();
        const vw = visibleSize.width;
        const vh = visibleSize.height;

        let origW = this._originalSize.width;
        let origH = this._originalSize.height;

        // Fallback: try to get aspect ratio from sprite frame
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
            return;
        }

        // "Cover" — scale to fill viewport, preserving aspect ratio
        const scale = Math.max(vw / origW, vh / origH);
        ut.setContentSize(origW * scale, origH * scale);
    }

    private onStateChanged(next: GameState) {
        this._scrolling = next === GameState.RUNNING || next === GameState.PLAYING;
    }

    update(dt: number) {
        if (!this._scrolling) return;
        // TODO: move background sprites to the left by speed * dt
    }
}
