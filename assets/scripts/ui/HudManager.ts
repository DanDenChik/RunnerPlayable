import { _decorator, Component, Node, Widget, UITransform, view, Sprite, SpriteFrame, Vec3, tween, Label } from 'cc';
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

    @property({ type: Node, tooltip: 'ScoreContainer node (parent of ScoreBg + ScoreLabel) for fly-to target' })
    scoreContainerNode: Node | null = null;

    @property({ type: Node, tooltip: 'Tutorial hint node (shown during TUTORIAL state)' })
    tutorialHint: Node | null = null;

    @property({ type: Node, tooltip: 'Download button node (bottom-right corner)' })
    downloadBtnNode: Node | null = null;

    // Game over UI
    @property({ type: SpriteFrame, tooltip: 'Fail sprite for game over' })
    failSpriteFrame: SpriteFrame | null = null;
    @property({ type: Node, tooltip: 'GameOver panel node' })
    gameOverPanelNode: Node | null = null;
    @property({ type: Node, tooltip: 'Score label node inside GameOver panel' })
    gameOverScoreLabelNode: Node | null = null;
    private _failNode: Node | null = null;
    @property({ type: Node, tooltip: 'finisheff node for finish effect (optional)' })
    finisheffNode: Node | null = null;

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

    @property({ type: Node, tooltip: 'GameWin panel node' })
    gameWinPanelNode: Node | null = null;
    
    @property({ type: Node, tooltip: 'Score label node inside GameWin panel' })
    gameWinScoreLabelNode: Node | null = null;

    /** Current viewport-to-design scale factor */
    private _scaleFactor: number = 1;
    get scaleFactor(): number { return this._scaleFactor; }

    onLoad() {
        this.ensureWidget();
        this.updateLayout();

        if (this.tutorialHint) {
            this.tutorialHint.active = true;
        }
        // Always hide game over/win panels at startup
        if (this.gameOverPanelNode) this.gameOverPanelNode.active = false;
        if (this.gameWinPanelNode) this.gameWinPanelNode.active = false;

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

        // ── Download button (bottom-right, fixed distance from bottom) ──
        if (this.downloadBtnNode) {
            const btnW = this.designBtnWidth * s;
            const btnH = this.designBtnHeight * s;
            const margin = this.designBtnMargin * s;

            // Position from the right edge, with a consistent bottom margin
            this.downloadBtnNode.setPosition(
                canvasW / 2 - margin - btnW / 2,
                -canvasH / 2 + margin + btnH / 2,
                0,
            );
        }

        // Center and scale end panels so they work on any aspect ratio
        if (this.gameOverPanelNode) {
            this.layoutEndPanel(this.gameOverPanelNode, s);
        }
        if (this.gameWinPanelNode) {
            this.layoutEndPanel(this.gameWinPanelNode, s);
        }
    }

    /** Center an end panel and apply uniform scaling based on viewport height */
    private layoutEndPanel(panel: Node, scaleFactor: number) {
        // Ensure the panel has a Widget so it stays centered on resize
        let widget = panel.getComponent(Widget);
        if (!widget) {
            widget = panel.addComponent(Widget);
        }
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = true;
        widget.isAlignTop = false;
        widget.isAlignBottom = false;
        widget.isAlignLeft = false;
        widget.isAlignRight = false;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        widget.updateAlignment();

        // Apply moderate scaling so the panel looks good on tall and wide screens
        const clampedScale = Math.max(0.7, Math.min(scaleFactor, 1.2));
        panel.setScale(clampedScale, clampedScale, 1);
    }

    private onStateChanged(next: GameState, _prev: GameState) {
        // Always hide GameOver panel unless showing it after FAIL animation
        if (this.gameOverPanelNode) this.gameOverPanelNode.active = false;
        // Restore bottom bar and download button by default
        if (this.bottomBar && this.bottomBar.node) this.bottomBar.node.active = true;
        if (this.downloadBtnNode) this.downloadBtnNode.active = true;
        // Hide win panel by default
        if (this.gameWinPanelNode) this.gameWinPanelNode.active = false;

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
            case GameState.LOSE:
                // Hide bottom bar and download button on game over
                if (this.bottomBar && this.bottomBar.node) this.bottomBar.node.active = false;
                if (this.downloadBtnNode) this.downloadBtnNode.active = false;
                this.showFailSprite();
                break;
            case GameState.WIN:
                // Hide bottom bar and download button on win
                if (this.bottomBar && this.bottomBar.node) this.bottomBar.node.active = false;
                if (this.downloadBtnNode) this.downloadBtnNode.active = false;
                this.showWinPanel();
                break;
            default:
                break;
        }
    }

    /** Show GameWin panel and animate score (appears 2s after win) */
    private showWinPanel() {
        if (!this.gameWinPanelNode) return;

        const delaySeconds = 2;
        this.scheduleOnce(() => {
            this.gameWinPanelNode!.active = true;
            if (this.gameWinScoreLabelNode && this.scoreDisplay) {
                const labelComp = this.gameWinScoreLabelNode.getComponent(Label);
                const finalScore = (this.scoreDisplay as any).getScore ? (this.scoreDisplay as any).getScore() : 0;
                if (labelComp) {
                    // Ensure score text doesn't get cut off
                    labelComp.overflow = Label.Overflow.SHRINK;
                    const scoreUT = this.gameWinScoreLabelNode.getComponent(UITransform);
                    if (scoreUT) {
                        scoreUT.setContentSize(scoreUT.contentSize.width * 2, scoreUT.contentSize.height);
                    }

                    let elapsed = 0;
                    const duration = 1.0;
                    const update = (dt: number) => {
                        elapsed += dt;
                        let t = Math.min(elapsed / duration, 1);
                        let val = Math.round(finalScore * t);
                        labelComp.string = `${val}$`;
                        if (t < 1) {
                            labelComp.scheduleOnce(() => update(1/60), 0);
                        } else {
                            labelComp.string = `${finalScore}$`;
                        }
                    };
                    labelComp.string = `0$`;
                    update(0);
                }
            }
        }, delaySeconds);
    }

    /** Show Fail sprite in center with pulse effect, then show gameOver panel after delay and animate score */
    private showFailSprite() {
        // Remove previous
        if (this._failNode) {
            this._failNode.destroy();
            this._failNode = null;
        }
        if (!this.failSpriteFrame) return;
        // Create node
        const node = new Node('FailSprite');
        node.parent = this.node;
        // Center using Widget
        const widget = node.addComponent(Widget);
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
        const visibleSize = view.getVisibleSize();
        const scale = visibleSize.height / 720;
        const size = 80 * 3 * scale;
        const ut = node.addComponent(UITransform);
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
                // Show gameOver panel after 3-4s delay (randomized)
                if (this.gameOverPanelNode) {
                    this.gameOverPanelNode.active = false;
                    const delay = 1
                    setTimeout(() => {
                        this.gameOverPanelNode.active = true;
                        // Pulse and rotate finisheff node if present
                        if (this.finisheffNode) {
                            // Reset scale and rotation
                            this.finisheffNode.setScale(1, 1, 1);
                            this.finisheffNode.setRotationFromEuler(0, 0, 0);
                            // Pulse
                            tween(this.finisheffNode)
                                .to(0.4, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'sineOut' })
                                .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
                                .repeatForever()
                                .start();
                            // Rotate
                            tween(this.finisheffNode)
                                .by(2, { angle: 360 })
                                .repeatForever()
                                .start();
                        }
                        if (this.gameOverScoreLabelNode && this.scoreDisplay) {
                            const labelComp = this.gameOverScoreLabelNode.getComponent(Label);
                            const finalScore = (this.scoreDisplay as any).getScore ? (this.scoreDisplay as any).getScore() : 0;
                            if (labelComp) {
                                // Ensure score text doesn't get cut off
                                labelComp.overflow = Label.Overflow.SHRINK;
                                const scoreUT = this.gameOverScoreLabelNode.getComponent(UITransform);
                                if (scoreUT) {
                                    scoreUT.setContentSize(scoreUT.contentSize.width * 2, scoreUT.contentSize.height);
                                }

                                let elapsed = 0;
                                const duration = 1.0;
                                const update = (dt: number) => {
                                    elapsed += dt;
                                    let t = Math.min(elapsed / duration, 1);
                                    let val = Math.round(finalScore * t);
                                    labelComp.string = `${val}$`;
                                    if (t < 1) {
                                        labelComp.scheduleOnce(() => update(1/60), 0);
                                    } else {
                                        labelComp.string = `${finalScore}$`;
                                    }
                                };
                                labelComp.string = `0$`;
                                update(0);
                            }
                        }
                    }, delay * 1000);
                }
            })
            .start();
        this._failNode = node;
        // Hide gameOver panel until animation finishes
        if (this.gameOverPanelNode) {
            this.gameOverPanelNode.active = false;
        }
        // Set score label to 0 immediately (will animate later)
        if (this.gameOverScoreLabelNode) {
            const labelComp = this.gameOverScoreLabelNode.getComponent(Label);
            if (labelComp) labelComp.string = `0$`;
        }
    }


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
