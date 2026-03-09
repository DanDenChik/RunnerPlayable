import { _decorator, Component, Animation, AnimationClip, Node, UITransform, view, Widget } from 'cc';
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

    onLoad() {
        this._anim = this.getComponent(Animation);
        this.positionBelowDecorations();
        GameManager.events.on('state-changed', this.onStateChanged, this);
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
        widget.isAlignLeft = false;
        widget.isAlignRight = false;
        widget.top = topValue;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        widget.updateAlignment();
    }

    private onStateChanged(next: GameState) {
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

    private playLoop(clipName: string) {
        if (!this._anim) return;

        const state = this._anim.getState(clipName);
        if (state) {
            state.wrapMode = AnimationClip.WrapMode.Loop;
        }

        this._anim.crossFade(clipName, 0.1);
    }
}
