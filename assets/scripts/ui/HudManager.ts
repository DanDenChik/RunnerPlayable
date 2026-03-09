import { _decorator, Component, Node, Widget, UITransform, view, Vec3 } from 'cc';
import { HealthDisplay } from './HealthDisplay';
import { ScoreDisplay } from './ScoreDisplay';
import { BottomBar } from './BottomBar';
import { DownloadButton } from './DownloadButton';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/** Design resolution used as a baseline for scaling */
const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 640;

/** Facade that wires HUD sub-components together and reacts to game state changes */
@ccclass('HudManager')
export class HudManager extends Component {

    @property({ type: HealthDisplay })
    healthDisplay: HealthDisplay | null = null;

    @property({ type: ScoreDisplay })
    scoreDisplay: ScoreDisplay | null = null;

    @property({ type: BottomBar })
    bottomBar: BottomBar | null = null;

    @property({ type: Node, tooltip: 'Tutorial hint node (shown during TUTORIAL state)' })
    tutorialHint: Node | null = null;

    @property({ type: Node, tooltip: 'Download button node (bottom-right corner)' })
    downloadBtnNode: Node | null = null;

    @property({ tooltip: 'Top bar padding from edge at design resolution' })
    designTopPadding: number = 16;

    @property({ tooltip: 'Top bar row height at design resolution' })
    designTopBarHeight: number = 48;

    @property({ tooltip: 'Download button width at design resolution' })
    designBtnWidth: number = 180;

    @property({ tooltip: 'Download button height at design resolution' })
    designBtnHeight: number = 64;

    @property({ tooltip: 'Download button margin from edge at design resolution' })
    designBtnMargin: number = 20;

    /** Current viewport-to-design scale factor */
    private _scaleFactor: number = 1;
    get scaleFactor(): number { return this._scaleFactor; }

    onLoad() {
        this.ensureWidget();
        this.updateLayout();

        if (this.tutorialHint) {
            this.tutorialHint.active = true;
        }

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

    /** Ensure this node stretches to fill the full canvas */
    private ensureWidget() {
        let w = this.getComponent(Widget);
        if (!w) w = this.node.addComponent(Widget);
        w.isAlignTop = true;
        w.isAlignBottom = true;
        w.isAlignLeft = true;
        w.isAlignRight = true;
        w.top = 0;
        w.bottom = 0;
        w.left = 0;
        w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();
    }

    private onResize() {
        this.updateLayout();
    }

    private updateLayout() {
        const visibleSize = view.getVisibleSize();
        const canvasW = visibleSize.width;
        const canvasH = visibleSize.height;
        this._scaleFactor = canvasH / DESIGN_HEIGHT;
        const s = this._scaleFactor;

        // ── Health (top-left, 20px from top, 15px from left) ──
        if (this.healthDisplay && this.healthDisplay.node) {
            const healthNode = this.healthDisplay.node;
            healthNode.setScale(1, 1, 1);
            healthNode.setPosition(
                -canvasW / 2 + 15,
                canvasH / 2 - 20,
                0,
            );
            const ht = healthNode.getComponent(UITransform);
            if (ht) {
                ht.anchorX = 0;
                ht.anchorY = 1;
            }
        }

        // ── Score (top-right, 20px from top, 15px from right) ──
        if (this.scoreDisplay && this.scoreDisplay.node) {
            const scoreNode = this.scoreDisplay.node;
            scoreNode.setScale(1, 1, 1);
            scoreNode.setPosition(
                canvasW / 2 - 15,
                canvasH / 2 - 20,
                0,
            );
            const st = scoreNode.getComponent(UITransform);
            if (st) {
                st.anchorX = 1;
                st.anchorY = 1;
            }
        }

        // ── Bottom bar ──
        this.bottomBar?.adjustLayout();

        // ── Download button (bottom-right, above bottom bar) ──
        if (this.downloadBtnNode) {
            const btnW = this.designBtnWidth * s;
            const btnH = this.designBtnHeight * s;
            const margin = this.designBtnMargin * s;

            const btnTransform = this.downloadBtnNode.getComponent(UITransform);
            if (btnTransform) {
                btnTransform.setContentSize(btnW, btnH);
            }

            // Position above bottom bar, from the right edge
            const barH = this.bottomBar ? this.bottomBar.barHeight : 0;
            this.downloadBtnNode.setPosition(
                canvasW / 2 - margin - btnW / 2,
                -canvasH / 2 + barH + margin + btnH / 2,
                0,
            );
        }
    }

    private onStateChanged(next: GameState, _prev: GameState) {
        switch (next) {
            case GameState.RUNNING:
                if (this.tutorialHint) this.tutorialHint.active = false;
                break;
            case GameState.TUTORIAL:
                if (this.tutorialHint) this.tutorialHint.active = true;
                break;
            case GameState.PLAYING:
                if (this.tutorialHint) this.tutorialHint.active = false;
                break;
            default:
                break;
        }
    }

    /* ───── public API for other systems ───── */

    setHealth(hp: number) {
        this.healthDisplay?.setHealth(hp);
    }

    damage() {
        this.healthDisplay?.damage();
    }

    setScore(value: number) {
        this.scoreDisplay?.setScore(value);
    }

    addScore(delta: number) {
        this.scoreDisplay?.addScore(delta);
    }
}
