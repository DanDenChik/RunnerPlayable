import { _decorator, Component, EventTarget, input, Input, EventTouch, director } from 'cc';
import { GameState } from './GameState';

const { ccclass, property } = _decorator;

/** Central game FSM – singleton accessible via GameManager.instance */
@ccclass('GameManager')
export class GameManager extends Component {

    static instance: GameManager | null = null;

    /** Global event bus so other systems can listen to state changes */
    static events: EventTarget = new EventTarget();

    @property({ type: Number })
    private _state: GameState = GameState.IDLE;

    get state(): GameState { return this._state; }

    /* ───── lifecycle ───── */

    onLoad() {
        if (GameManager.instance) {
            this.node.destroy();
            return;
        }
        GameManager.instance = this;

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

    onDestroy() {
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    }

    /* ───── state machine ───── */

    changeState(next: GameState) {
        if (this._state === next) return;
        const prev = this._state;
        this._state = next;
        GameManager.events.emit('state-changed', next, prev);
    }

    /* ───── input ───── */

    private onTouchStart(_event: EventTouch) {
        switch (this._state) {
            case GameState.IDLE:
                this.changeState(GameState.RUNNING);
                break;

            case GameState.TUTORIAL:
                this.changeState(GameState.PLAYING);
                break;

            case GameState.PLAYING:
                // Will be used for jump later
                GameManager.events.emit('player-jump');
                break;

            default:
                break;
        }
    }

    /* ───── public helpers ───── */

    /** Called by obstacle system when the first obstacle is reached */
    enterTutorial() {
        if (this._state === GameState.RUNNING) {
            this.changeState(GameState.TUTORIAL);
        }
    }

    /** Called when player dies */
    lose() {
        if (this._state === GameState.PLAYING) {
            this.changeState(GameState.LOSE);
        }
    }

    /** Called when player reaches finish */
    win() {
        if (this._state === GameState.PLAYING) {
            this.changeState(GameState.WIN);
        }
    }

    /** Transition from Win/Lose to Download screen */
    showDownload() {
        this.changeState(GameState.DOWNLOAD);
    }
}
