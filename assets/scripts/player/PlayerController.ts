import { _decorator, Component, Animation, AnimationClip } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

const ANIM_IDLE = 'idle';
const ANIM_RUN = 'run';
const ANIM_JUMP = 'jump';

/** Player character controller – switches Animation clips based on game state */
@ccclass('PlayerController')
export class PlayerController extends Component {

    private _anim: Animation | null = null;

    onLoad() {
        this._anim = this.getComponent(Animation);
        GameManager.events.on('state-changed', this.onStateChanged, this);
        GameManager.events.on('player-jump', this.onJump, this);
    }

    start() {
        this.playLoop(ANIM_IDLE);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
        GameManager.events.off('player-jump', this.onJump, this);
    }

    private onStateChanged(next: GameState) {
        switch (next) {
            case GameState.IDLE:
            case GameState.TUTORIAL:
            case GameState.WIN:
            case GameState.LOSE:
            case GameState.DOWNLOAD:
                this.playLoop(ANIM_IDLE);
                break;
            case GameState.RUNNING:
            case GameState.PLAYING:
                this.playLoop(ANIM_RUN);
                break;
        }
    }

    private onJump() {
        if (!this._anim) return;

        const state = this._anim.getState(ANIM_JUMP);
        if (state) {
            state.wrapMode = AnimationClip.WrapMode.Normal;
        }

        this._anim.once(Animation.EventType.FINISHED, this.onJumpFinished, this);
        this._anim.crossFade(ANIM_JUMP, 0.1);
    }

    private onJumpFinished() {
        // Return to run if still playing
        const gs = GameManager.instance?.state;
        if (gs === GameState.PLAYING || gs === GameState.RUNNING) {
            this.playLoop(ANIM_RUN);
        } else {
            this.playLoop(ANIM_IDLE);
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
