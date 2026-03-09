import { _decorator, Component, Node, Sprite, UITransform, Widget, view } from 'cc';

const { ccclass, property } = _decorator;

/** Design resolution baseline */
const DESIGN_HEIGHT = 640;

/**
 * Adaptive bottom bar:
 * - Scales barHeight proportionally to viewport height
 * - Left part keeps its original aspect ratio (w:h = 1080:201)
 * - Right part fills the remaining horizontal space
 * - Widget pins the bar to the bottom edge
 */
@ccclass('BottomBar')
export class BottomBar extends Component {

    @property({ type: Node, tooltip: 'Left part of the bar (fixed aspect ratio)' })
    barLeft: Node | null = null;

    @property({ type: Node, tooltip: 'Right part (stretches to fill remaining width)' })
    barRight: Node | null = null;

    @property({ tooltip: 'Fixed height of the bottom bar in pixels (no adaptive scaling)' })
    designBarHeight: number = 180;

    /** Actual bar height after scaling */
    private _barHeight: number = 120;
    get barHeight(): number { return this._barHeight; }

    onLoad() {
        this.ensureWidget();
        this.adjustLayout();
    }

    onEnable() {
        view.on('canvas-resize', this.adjustLayout, this);
    }

    onDisable() {
        view.off('canvas-resize', this.adjustLayout, this);
    }

    /** Pin whole bar to bottom, stretch horizontally */
    private ensureWidget() {
        let w = this.getComponent(Widget);
        if (!w) w = this.node.addComponent(Widget);
        w.isAlignBottom = true;
        w.isAlignLeft = true;
        w.isAlignRight = true;
        w.bottom = 0;
        w.left = 0;
        w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    }

    adjustLayout() {
        const visibleSize = view.getVisibleSize();
        const canvasWidth = visibleSize.width;

        // Use fixed bar height in landscape; 1.5x it in portrait
        const isPortrait = visibleSize.height > visibleSize.width;
        this._barHeight = isPortrait ? this.designBarHeight * 1.5 : this.designBarHeight * 1.0;

        // Resize own UITransform
        const selfTransform = this.getComponent(UITransform);
        if (selfTransform) {
            selfTransform.setContentSize(canvasWidth, this._barHeight);
        }

        // --- Left part: keep aspect ratio ---
        let leftWidth = 0;
        if (this.barLeft) {
            const leftTransform = this.barLeft.getComponent(UITransform);
            if (leftTransform) {
                const leftSprite = this.barLeft.getComponent(Sprite);
                let ratio = 1080 / 201; // default w:h ratio
                if (leftSprite && leftSprite.spriteFrame) {
                    const origSize = leftSprite.spriteFrame.originalSize;
                    ratio = origSize.width / origSize.height;
                }
                leftWidth = this._barHeight * ratio;
                leftTransform.setContentSize(leftWidth, this._barHeight);
            }
            // anchor 0,0 → position at origin
            this.barLeft.setPosition(0, 0, 0);
        }

        // --- Right part: fill remaining space ---
        const remainingWidth = Math.max(0, canvasWidth - leftWidth);
        if (this.barRight) {
            const rightTransform = this.barRight.getComponent(UITransform);
            if (rightTransform) {
                rightTransform.setContentSize(remainingWidth, this._barHeight);
            }
            this.barRight.setPosition(leftWidth, 0, 0);
        }
    }
}
