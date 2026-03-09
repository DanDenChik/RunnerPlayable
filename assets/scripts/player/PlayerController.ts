import { _decorator, Component, Animation, AnimationClip, Node, UITransform, view, Widget, Sprite, Color, tween, Vec3 } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

const ANIM_IDLE = 'idle';
const ANIM_RUN = 'run';
const ANIM_JUMP = 'jump';
const ANIM_DAMAGE = 'damage';

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ type: Node, tooltip: 'DecorationLayer node to align player below' })
    decorationLayer: Node | null = null;

    private _anim: Animation | null = null;
    private _sprite: Sprite | null = null;

    /* ─── invincibility state ─── */
    private static readonly INVINCIBILITY_DURATION = 1.0;
    private static readonly FLASH_INTERVAL = 0.1;

    private _invincible = false;
    private _invincibilityTimer = 0;
    private _flashTimer = 0;
    private _flashVisible = true;
    private _playingDamage = false;
    private _jumping = false;
    private _groundY = 0;

    /* ─── jump tuning ─── */
    private static readonly JUMP_HEIGHT_DESIGN = 225;
    private static readonly JUMP_UP_TIME = 0.45;
    private static readonly JUMP_DOWN_TIME = 0.375;
    private static readonly DESIGN_HEIGHT = 720;

    get isInvincible(): boolean { return this._invincible; }
    get isJumping(): boolean { return this._jumping; }
    get groundY(): number { return this._groundY; }

    onLoad() {
        this._anim = this.getComponent(Animation);
        this._sprite = this.getComponent(Sprite);
        this.positionBelowDecorations();
        GameManager.events.on('state-changed', this.onStateChanged, this);
        GameManager.events.on('player-damaged', this.onDamaged, this);
        GameManager.events.on('player-jump', this.onJump, this);
    }

    onEnable() {
        view.on('canvas-resize', this.positionBelowDecorations, this);
    }

    onDisable() {
        view.off('canvas-resize', this.positionBelowDecorations, this);
    }

    start() {
        this.playLoop(ANIM_IDLE);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
        GameManager.events.off('player-damaged', this.onDamaged, this);
        GameManager.events.off('player-jump', this.onJump, this);
    }

    private static readonly LAYER_HEIGHT_RATIO = 383 / 720;
    private static readonly MIN_LAYER_HEIGHT_RATIO = 0.5;
    private static readonly PLAYER_HEIGHT_RATIO = 150 / 720;
    /** Original aspect ratio (w/h) of the player sprite */
    private _playerAspect = 105 / 150;

    /** Position player using a top-pinned Widget at vh * LAYER_HEIGHT_RATIO */
    private positionBelowDecorations() {
        const vs = view.getVisibleSize();
        const vh = vs.height;
        const ratio = Math.max(PlayerController.LAYER_HEIGHT_RATIO, PlayerController.MIN_LAYER_HEIGHT_RATIO);
        const topValue = vh * ratio;

        // Adaptive height
        const h = vh * PlayerController.PLAYER_HEIGHT_RATIO;
        const w = h * this._playerAspect;
        const ut = this.node.getComponent(UITransform);
        if (ut) {
            ut.setContentSize(w, h);
        }

        let widget = this.node.getComponent(Widget);
        if (!widget) widget = this.node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = false;
        widget.isAlignRight = false;
        widget.top = topValue;

        // In portrait mode, pin to left edge with 10px margin
        const isPortrait = vs.height > vs.width;
        if (isPortrait) {
            widget.isAlignLeft = true;
            widget.left = -30;
        } else {
            widget.isAlignLeft = false;
        }

        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        widget.updateAlignment();
    }

    private onStateChanged(next: GameState) {
        // Don't interrupt the damage animation
        if (this._playingDamage) return;

        switch (next) {
            case GameState.IDLE:
            case GameState.WIN:
            case GameState.LOSE:
            case GameState.DOWNLOAD:
                this.playLoop(ANIM_IDLE);
                break;
            case GameState.RUNNING:
            case GameState.TUTORIAL:
            case GameState.PLAYING:
                this.playLoop(ANIM_RUN);
                break;
        }
    }

    /* ─── damage / invincibility ─── */

    private onDamaged() {
        if (this._invincible) return;
        this._invincible = true;
        this._invincibilityTimer = PlayerController.INVINCIBILITY_DURATION;
        this._flashTimer = 0;
        this._flashVisible = true;
        if (this._sprite) {
            this._sprite.color = new Color(255, 80, 80, 255);
        }

        // Play damage animation once, then resume run
        this.playDamageAnim();
    }

    private playDamageAnim() {
        if (!this._anim) return;

        const state = this._anim.getState(ANIM_DAMAGE);
        if (!state) return;

        state.wrapMode = AnimationClip.WrapMode.Normal;
        this._playingDamage = true;
        this._anim.crossFade(ANIM_DAMAGE, 0.05);

        this._anim.once(Animation.EventType.FINISHED, () => {
            this._playingDamage = false;
            // Resume run if still in a running state
            const gs = GameManager.instance?.state;
            if (gs === GameState.RUNNING || gs === GameState.TUTORIAL || gs === GameState.PLAYING) {
                this.playLoop(ANIM_RUN);
            }
        });
    }

    update(dt: number) {
        if (!this._invincible) return;

        this._invincibilityTimer -= dt;
        this._flashTimer -= dt;

        if (this._flashTimer <= 0) {
            this._flashTimer = PlayerController.FLASH_INTERVAL;
            this._flashVisible = !this._flashVisible;
            if (this._sprite) {
                this._sprite.color = this._flashVisible
                    ? new Color(255, 80, 80, 255)
                    : new Color(255, 255, 255, 100);
            }
        }

        if (this._invincibilityTimer <= 0) {
            this._invincible = false;
            if (this._sprite) {
                this._sprite.color = Color.WHITE;
            }
        }
    }

    private playLoop(clipName: string) {
        if (!this._anim) return;

        const state = this._anim.getState(clipName);
        if (state) {
            state.wrapMode = AnimationClip.WrapMode.Loop;
        }

        this._anim.crossFade(clipName, 0.1);
    }

    /* ─── jump ─── */

    private onJump() {
        if (this._jumping) return;
        this._jumping = true;
        this._groundY = this.node.position.y;

        const vh = view.getVisibleSize().height;
        const scale = vh / PlayerController.DESIGN_HEIGHT;
        const jumpH = PlayerController.JUMP_HEIGHT_DESIGN * scale;
        const peakY = this._groundY + jumpH;
        const pos = this.node.position;

        // Play jump animation
        if (this._anim) {
            const state = this._anim.getState(ANIM_JUMP);
            if (state) state.wrapMode = AnimationClip.WrapMode.Normal;
            this._anim.crossFade(ANIM_JUMP, 0.05);
        }

        tween(this.node)
            .to(PlayerController.JUMP_UP_TIME, { position: new Vec3(pos.x, peakY, pos.z) }, { easing: 'sineOut' })
            .to(PlayerController.JUMP_DOWN_TIME, { position: new Vec3(pos.x, this._groundY, pos.z) }, { easing: 'sineIn' })
            .call(() => {
                this._jumping = false;
                // Resume run animation
                const gs = GameManager.instance?.state;
                if (gs === GameState.RUNNING || gs === GameState.TUTORIAL || gs === GameState.PLAYING) {
                    this.playLoop(ANIM_RUN);
                }
            })
            .start();
    }
}
