import { _decorator, Component, Node, tween, Vec3, view, Label, UITransform, Widget } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/**
 * Tutorial overlay shown from game start (IDLE) until first user input (IDLE → RUNNING).
 * - Text centered on screen
 * - Cursor centered in the bottom half of the screen
 * - In portrait mode, text wraps to 2 lines with a larger font
 */
@ccclass('TutorialLayer')
export class TutorialLayer extends Component {

    @property({ type: Node, tooltip: 'Cursor node to animate' })
    cursor: Node | null = null;

    @property({ type: Node, tooltip: 'Tutorial text node with Label' })
    textNode: Node | null = null;

    @property({ tooltip: 'Font size in landscape' })
    landscapeFontSize: number = 40;

    @property({ tooltip: 'Font size in portrait' })
    portraitFontSize: number = 56;

    private readonly LANDSCAPE_TEXT = 'Tap to start earning!';
    private readonly PORTRAIT_TEXT = 'Tap to start\nearning!';

    private _originalScale: Vec3 = new Vec3(1, 1, 1);

    onLoad() {
        this.node.active = true;
        this.updateLayout();

        if (this.cursor) {
            this._originalScale = this.cursor.scale.clone();
            this.startPulse();
        }

        GameManager.events.on('state-changed', this.onStateChanged, this);
    }

    onEnable() {
        view.on('canvas-resize', this.updateLayout, this);
    }

    onDisable() {
        view.off('canvas-resize', this.updateLayout, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
    }

    private updateLayout() {
        const vs = view.getVisibleSize();
        const vw = vs.width;
        const vh = vs.height;
        const isPortrait = vh > vw;

        // Text: centered on screen (0, 0)
        if (this.textNode) {
            this.textNode.setPosition(0, 0, 0);
            const label = this.textNode.getComponent(Label);
            if (label) {
                if (isPortrait) {
                    label.string = this.PORTRAIT_TEXT;
                    label.fontSize = this.portraitFontSize;
                    label.lineHeight = this.portraitFontSize;
                } else {
                    label.string = this.LANDSCAPE_TEXT;
                    label.fontSize = this.landscapeFontSize;
                    label.lineHeight = this.landscapeFontSize;
                }
            }
        }

        // Cursor: 25% vh from bottom using Widget
        if (this.cursor) {
            let w = this.cursor.getComponent(Widget);
            if (!w) w = this.cursor.addComponent(Widget);
            w.isAlignTop = false;
            w.isAlignBottom = true;
            w.isAlignLeft = false;
            w.isAlignRight = false;
            w.bottom = vh * 0.25;
            w.isAbsoluteBottom = true;
            w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
            // Center horizontally
            this.cursor.setPosition(0, this.cursor.position.y, 0);
            w.updateAlignment();
        }
    }

    private startPulse() {
        if (!this.cursor) return;

        const big = new Vec3(
            this._originalScale.x * 1.1,
            this._originalScale.y * 1.1,
            this._originalScale.z,
        );

        tween(this.cursor)
            .to(0.5, { scale: big }, { easing: 'sineInOut' })
            .to(0.5, { scale: this._originalScale.clone() }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private onStateChanged(next: GameState) {
        if (next === GameState.RUNNING || next === GameState.TUTORIAL) {
            if (this.cursor) tween(this.cursor).stop();
            this.node.active = false;
        }
    }
}
